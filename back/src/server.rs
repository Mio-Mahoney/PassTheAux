use std::{collections::HashMap, env, error::Error, sync::Arc};

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use tokio::{net::TcpListener, sync::{broadcast, RwLock}};
use tower_http::cors::CorsLayer;

use crate::{get_spotify_token, search_spotify};

#[derive(Clone)]
pub struct AppState {
    rooms: Arc<RwLock<RoomManager>>,
    events: Arc<RwLock<HashMap<u64, broadcast::Sender<RoomEvent>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(RoomManager::new())),
            events: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GameState {
    Lobby,
    SeedSelection,
    Listening,
    Submission,
    Voting,
    Results,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: u64,
    pub room_id: u64,
    pub name: String,
    pub score: u32,
    pub is_host: bool,
    pub is_ready: bool,
    pub is_connected: bool,
    pub joined_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: u64,
    pub host_id: u64,
    pub join_code: String,
    pub name: String,
    pub state: GameState,
    pub current_round: u32,
    pub current_hot_seat_id: Option<u64>,
    pub seed_song_id: Option<u64>,
    pub seed_prompt: Option<String>,
    pub created_at: i64,
    pub state_changed_at: i64,
    pub max_players: u32,
    pub players: Vec<Player>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RoomEvent {
    StateChanged { room: Room },
    PlayerJoined { player: Player },
    PlayerUpdated { player: Player },
    PlayerLeft { player_id: u64, reason: String },
    Snapshot { room: Room },
}

impl Room {
    fn new(id: u64, host_id: u64, join_code: String, name: String, max_players: u32, host_name: String) -> Self {
        let now = Utc::now().timestamp_millis();
        let host = Player {
            id: host_id,
            room_id: id,
            name: host_name,
            score: 0,
            is_host: true,
            is_ready: false,
            is_connected: true,
            joined_at: now,
        };

        Self {
            id,
            host_id,
            join_code,
            name,
            state: GameState::Lobby,
            current_round: 0,
            current_hot_seat_id: None,
            seed_song_id: None,
            seed_prompt: None,
            created_at: now,
            state_changed_at: now,
            max_players,
            players: vec![host],
        }
    }

    fn all_ready(&self) -> bool {
        !self.players.is_empty() && self.players.iter().all(|player| player.is_ready)
    }

    fn is_joinable(&self) -> bool {
        self.state == GameState::Lobby && self.players.len() < self.max_players as usize
    }
}

#[derive(Default)]
pub struct RoomManager {
    rooms_by_id: HashMap<u64, Room>,
    room_ids_by_join_code: HashMap<String, u64>,
    next_room_id: u64,
    next_player_id: u64,
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms_by_id: HashMap::new(),
            room_ids_by_join_code: HashMap::new(),
            next_room_id: 1,
            next_player_id: 1,
        }
    }

    pub fn create_room(&mut self, host_name: String, room_name: Option<String>, max_players: Option<u32>) -> Room {
        let room_id = self.next_room_id;
        self.next_room_id += 1;

        let host_id = self.next_player_id;
        self.next_player_id += 1;

        let join_code = self.generate_join_code();
        let room = Room::new(
            room_id,
            host_id,
            join_code.clone(),
            room_name.unwrap_or_else(|| format!("{}'s room", host_name)),
            max_players.unwrap_or(8),
            host_name,
        );

        self.room_ids_by_join_code.insert(join_code, room_id);
        self.rooms_by_id.insert(room_id, room.clone());
        room
    }

    pub fn get_room(&self, room_id: u64) -> Option<Room> {
        self.rooms_by_id.get(&room_id).cloned()
    }

    pub fn get_room_by_join_code(&self, join_code: &str) -> Option<Room> {
        let room_id = self.room_ids_by_join_code.get(&join_code.trim().to_ascii_uppercase())?;
        self.get_room(*room_id)
    }

    pub fn join_room(&mut self, join_code: &str, player_name: String) -> Result<(Room, Player), String> {
        let join_code = join_code.trim().to_ascii_uppercase();
        let room_id = *self
            .room_ids_by_join_code
            .get(&join_code)
            .ok_or_else(|| "invalid join code".to_string())?;

        let player_id = self.next_player_id;
        self.next_player_id += 1;

        let room = self.rooms_by_id.get_mut(&room_id).ok_or_else(|| "room not found".to_string())?;
        if !room.is_joinable() {
            return Err("room is not joinable".into());
        }

        if room.players.iter().any(|player| player.name.eq_ignore_ascii_case(&player_name)) {
            return Err("player name already taken".into());
        }

        let now = Utc::now().timestamp_millis();
        let player = Player {
            id: player_id,
            room_id,
            name: player_name,
            score: 0,
            is_host: false,
            is_ready: false,
            is_connected: true,
            joined_at: now,
        };

        room.players.push(player.clone());
        Ok((room.clone(), player))
    }

    pub fn set_ready(&mut self, room_id: u64, player_id: u64, ready: bool) -> Result<Room, String> {
        let room = self.rooms_by_id.get_mut(&room_id).ok_or_else(|| "room not found".to_string())?;
        if room.state != GameState::Lobby {
            return Err("ready state can only change in lobby".into());
        }

        let player = room.players.iter_mut().find(|player| player.id == player_id).ok_or_else(|| "player not found".to_string())?;
        player.is_ready = ready;
        Ok(room.clone())
    }

    pub fn start_room(&mut self, room_id: u64, player_id: u64) -> Result<Room, String> {
        let room = self.rooms_by_id.get_mut(&room_id).ok_or_else(|| "room not found".to_string())?;
        if room.state != GameState::Lobby {
            return Err("room already started".into());
        }

        if room.host_id != player_id {
            return Err("only the host can start the room".into());
        }

        if room.players.len() < 2 {
            return Err("at least two players are required".into());
        }

        if !room.all_ready() {
            return Err("not all players are ready".into());
        }

        room.state = GameState::SeedSelection;
        room.current_round = 1;
        room.state_changed_at = Utc::now().timestamp_millis();
        room.current_hot_seat_id = room.players.iter().find(|player| !player.is_host).map(|player| player.id);

        for player in &mut room.players {
            player.is_ready = false;
        }

        Ok(room.clone())
    }

    pub fn leave_room(&mut self, room_id: u64, player_id: u64) -> Result<Option<Room>, String> {
        let mut room_join_code = None;
        let mut room_became_empty = false;

        {
            let room = self.rooms_by_id.get_mut(&room_id).ok_or_else(|| "room not found".to_string())?;
            let position = room.players.iter().position(|player| player.id == player_id).ok_or_else(|| "player not found".to_string())?;
            let was_host = room.players[position].is_host;
            room_join_code = Some(room.join_code.clone());
            room.players.remove(position);
            room_became_empty = room.players.is_empty();

            if !room_became_empty && was_host {
                room.host_id = room.players[0].id;
                for player in &mut room.players {
                    player.is_host = player.id == room.host_id;
                }
            }
        }

        if room_became_empty {
            let removed_join_code = room_join_code.expect("join code must exist");
            self.rooms_by_id.remove(&room_id);
            self.room_ids_by_join_code.remove(&removed_join_code);
            return Ok(None);
        }

        Ok(self.rooms_by_id.get(&room_id).cloned())
    }

    fn generate_join_code(&self) -> String {
        loop {
            let code: String = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(6)
                .map(char::from)
                .map(|ch| ch.to_ascii_uppercase())
                .collect();

            if !self.room_ids_by_join_code.contains_key(&code) {
                return code;
            }
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub host_name: String,
    pub room_name: Option<String>,
    pub max_players: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct JoinRoomRequest {
    pub join_code: String,
    pub player_name: String,
}

#[derive(Debug, Deserialize)]
pub struct ReadyRequest {
    pub player_id: u64,
    pub ready: bool,
}

#[derive(Debug, Deserialize)]
pub struct StartRoomRequest {
    pub player_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct LeaveRoomRequest {
    pub player_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct SpotifySearchQuery {
    pub q: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct JoinRoomResponse {
    pub room: Room,
    pub player: Player,
}

#[derive(Debug, Serialize)]
pub struct LeaveRoomResponse {
    pub room: Option<Room>,
    pub deleted: bool,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(ErrorResponse { error: self.message });
        (self.status, body).into_response()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/rooms", post(create_room))
        .route("/rooms/join", post(join_room))
        .route("/rooms/:room_id", get(get_room))
        .route("/rooms/code/:join_code", get(get_room_by_code))
        .route("/rooms/:room_id/events", get(room_events))
        .route("/rooms/:room_id/ready", post(set_ready))
        .route("/rooms/:room_id/start", post(start_room))
        .route("/rooms/:room_id/leave", post(leave_room))
        .route("/spotify/search", get(spotify_search))
        .route("/spotify/token", get(spotify_token))
        .with_state(state)
        .layer(CorsLayer::permissive())
}

pub async fn run() -> Result<(), Box<dyn Error>> {
    let port = env::var("BACKEND_PORT").unwrap_or_else(|_| "8080".into());
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await?;

    println!("Backend HTTP server listening on {}", addr);
    axum::serve(listener, router(AppState::new())).await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

async fn create_room(
    State(state): State<AppState>,
    Json(payload): Json<CreateRoomRequest>,
) -> Result<Json<Room>, ApiError> {
    if payload.host_name.trim().is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "host_name is required"));
    }

    let mut manager = state.rooms.write().await;
    let room = manager.create_room(payload.host_name.trim().to_string(), payload.room_name, payload.max_players);
    drop(manager);

    broadcast_event(&state, room.id, RoomEvent::Snapshot { room: room.clone() }).await;
    Ok(Json(room))
}

async fn join_room(
    State(state): State<AppState>,
    Json(payload): Json<JoinRoomRequest>,
) -> Result<Json<JoinRoomResponse>, ApiError> {
    if payload.join_code.trim().is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "join_code is required"));
    }

    if payload.player_name.trim().is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "player_name is required"));
    }

    let mut manager = state.rooms.write().await;
    let (room, player) = manager
        .join_room(payload.join_code.trim(), payload.player_name.trim().to_string())
        .map_err(|message| ApiError::new(StatusCode::BAD_REQUEST, message))?;

    drop(manager);

    broadcast_event(&state, room.id, RoomEvent::PlayerJoined { player: player.clone() }).await;
    broadcast_event(&state, room.id, RoomEvent::StateChanged { room: room.clone() }).await;

    Ok(Json(JoinRoomResponse { room, player }))
}

async fn get_room(
    State(state): State<AppState>,
    Path(room_id): Path<u64>,
) -> Result<Json<Room>, ApiError> {
    let manager = state.rooms.read().await;
    let room = manager
        .get_room(room_id)
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "room not found"))?;

    Ok(Json(room))
}

async fn get_room_by_code(
    State(state): State<AppState>,
    Path(join_code): Path<String>,
) -> Result<Json<Room>, ApiError> {
    let manager = state.rooms.read().await;
    let room = manager
        .get_room_by_join_code(join_code.trim())
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "room not found"))?;

    Ok(Json(room))
}

async fn set_ready(
    State(state): State<AppState>,
    Path(room_id): Path<u64>,
    Json(payload): Json<ReadyRequest>,
) -> Result<Json<Room>, ApiError> {
    let mut manager = state.rooms.write().await;
    let room = manager
        .set_ready(room_id, payload.player_id, payload.ready)
        .map_err(|message| ApiError::new(StatusCode::BAD_REQUEST, message))?;

    let player = room.players.iter().find(|player| player.id == payload.player_id).cloned();
    drop(manager);

    if let Some(player) = player {
        broadcast_event(&state, room.id, RoomEvent::PlayerUpdated { player }).await;
    }
    broadcast_event(&state, room.id, RoomEvent::StateChanged { room: room.clone() }).await;

    Ok(Json(room))
}

async fn start_room(
    State(state): State<AppState>,
    Path(room_id): Path<u64>,
    Json(payload): Json<StartRoomRequest>,
) -> Result<Json<Room>, ApiError> {
    let mut manager = state.rooms.write().await;
    let room = manager
        .start_room(room_id, payload.player_id)
        .map_err(|message| ApiError::new(StatusCode::BAD_REQUEST, message))?;

    drop(manager);

    broadcast_event(&state, room.id, RoomEvent::StateChanged { room: room.clone() }).await;

    Ok(Json(room))
}

async fn leave_room(
    State(state): State<AppState>,
    Path(room_id): Path<u64>,
    Json(payload): Json<LeaveRoomRequest>,
) -> Result<Json<LeaveRoomResponse>, ApiError> {
    let mut manager = state.rooms.write().await;
    let result = manager
        .leave_room(room_id, payload.player_id)
        .map_err(|message| ApiError::new(StatusCode::BAD_REQUEST, message))?;

    drop(manager);

    broadcast_event(
        &state,
        room_id,
        RoomEvent::PlayerLeft {
            player_id: payload.player_id,
            reason: "left".to_string(),
        },
    )
    .await;

    if let Some(room) = result.as_ref() {
        broadcast_event(&state, room.id, RoomEvent::StateChanged { room: room.clone() }).await;
    }

    Ok(Json(LeaveRoomResponse {
        deleted: result.is_none(),
        room: result,
    }))
}

async fn room_events(
    State(state): State<AppState>,
    Path(room_id): Path<u64>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let room = {
        let manager = state.rooms.read().await;
        manager
            .get_room(room_id)
            .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "room not found"))?
    };

    Ok(ws.on_upgrade(move |socket| handle_room_socket(socket, state, room_id, room)))
}

async fn handle_room_socket(mut socket: WebSocket, state: AppState, room_id: u64, room: Room) {
    let mut receiver = room_event_receiver(&state, room_id).await;

    if send_event(&mut socket, &RoomEvent::Snapshot { room }).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            incoming = socket.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            event = receiver.recv() => {
                match event {
                    Ok(event) => {
                        if send_event(&mut socket, &event).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    }
}

async fn room_event_receiver(state: &AppState, room_id: u64) -> broadcast::Receiver<RoomEvent> {
    let mut events = state.events.write().await;
    events
        .entry(room_id)
        .or_insert_with(|| {
            let (sender, _) = broadcast::channel(64);
            sender
        })
        .subscribe()
}

async fn broadcast_event(state: &AppState, room_id: u64, event: RoomEvent) {
    let mut events = state.events.write().await;
    let sender = events.entry(room_id).or_insert_with(|| {
        let (sender, _) = broadcast::channel(64);
        sender
    });
    let _ = sender.send(event);
}

async fn send_event(socket: &mut WebSocket, event: &RoomEvent) -> Result<(), ()> {
    let payload = serde_json::to_string(event).map_err(|_| ())?;
    socket.send(Message::Text(payload.into())).await.map_err(|_| ())
}

async fn spotify_search(
    Query(params): Query<SpotifySearchQuery>,
) -> Result<Json<Vec<crate::Song>>, ApiError> {
    let query = params.q.unwrap_or_default();
    let limit = params.limit.unwrap_or(10);

    let songs = search_spotify(&query, limit)
        .map_err(|message| ApiError::new(StatusCode::BAD_GATEWAY, message))?;

    Ok(Json(songs))
}

async fn spotify_token() -> Result<Json<serde_json::Value>, ApiError> {
    let token = get_spotify_token().map_err(|message| ApiError::new(StatusCode::BAD_GATEWAY, message))?;
    Ok(Json(serde_json::json!({"access_token": token})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_room_makes_joinable_room() {
        let mut manager = RoomManager::new();
        let room = manager.create_room("Alice".into(), None, None);

        assert_eq!(room.state, GameState::Lobby);
        assert_eq!(room.players.len(), 1);
        assert_eq!(room.players[0].is_host, true);
        assert_eq!(room.players[0].name, "Alice");
        assert_eq!(room.join_code.len(), 6);
        assert!(manager.get_room_by_join_code(&room.join_code).is_some());
        assert!(manager.get_room_by_join_code(&room.join_code.to_lowercase()).is_some());
    }

    #[test]
    fn room_event_serializes_for_websocket_clients() {
        let room = RoomManager::new().create_room("Alice".into(), None, None);
        let event = RoomEvent::Snapshot { room };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "snapshot");
        assert!(json.get("room").is_some());
    }

    #[test]
    fn join_room_rejects_duplicate_names_and_full_rooms() {
        let mut manager = RoomManager::new();
        let room = manager.create_room("Alice".into(), None, Some(2));

        let join_code = room.join_code.clone().to_lowercase();
        assert!(manager.join_room(&join_code, "Bob".into()).is_ok());
        assert!(manager.join_room(&join_code, "Bob".into()).is_err());
        assert!(manager.join_room(&join_code, "Carol".into()).is_err());
    }

    #[test]
    fn ready_and_start_follow_lobby_rules() {
        let mut manager = RoomManager::new();
        let room = manager.create_room("Alice".into(), None, None);
        let (room, bob) = manager.join_room(&room.join_code, "Bob".into()).unwrap();

        assert!(manager.start_room(room.id, room.host_id).is_err());

        manager.set_ready(room.id, room.host_id, true).unwrap();
        manager.set_ready(room.id, bob.id, true).unwrap();

        let started = manager.start_room(room.id, room.host_id).unwrap();
        assert_eq!(started.state, GameState::SeedSelection);
        assert_eq!(started.current_round, 1);
        assert!(started.current_hot_seat_id.is_some());
        assert!(started.players.iter().all(|player| !player.is_ready));
    }
}