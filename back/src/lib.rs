#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::sync::Mutex;

use chrono::{Duration, Utc};
use once_cell::sync::Lazy;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum GameState {
    Lobby,
    SeedSelection,
    Submission,
    Voting,
    Scoreboard,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub is_host: bool,
    pub ready: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Song {
    pub id: String,
    pub name: String,
    pub artists: Vec<String>,
    pub album_cover_url: Option<String>,
    pub preview_url: Option<String>,
    pub submitted_by: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Rating {
    pub rater_id: String,
    pub song_id: String,
    pub points: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub players: Vec<Player>,
    pub state: GameState,
    pub songs: Vec<Song>,
    pub ratings: Vec<Rating>,
    pub max_players: usize,
}

impl Room {
    pub fn new(id: &str, name: &str, host: Player, max_players: usize) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            players: vec![host],
            state: GameState::Lobby,
            songs: vec![],
            ratings: vec![],
            max_players,
        }
    }

    pub fn add_player(&mut self, p: Player) -> Result<(), String> {
        if self.players.len() >= self.max_players {
            Err("room full".into())
        } else {
            self.players.push(p);
            Ok(())
        }
    }

    pub fn remove_player(&mut self, player_id: &str) -> Result<(), String> {
        if let Some(pos) = self.players.iter().position(|p| p.id == player_id) {
            self.players.remove(pos);
            Ok(())
        } else {
            Err("player not found".into())
        }
    }

    pub fn set_ready(&mut self, player_id: &str, ready: bool) -> Result<(), String> {
        if let Some(p) = self.players.iter_mut().find(|p| p.id == player_id) {
            p.ready = ready;
            Ok(())
        } else {
            Err("player not found".into())
        }
    }

    pub fn all_ready(&self) -> bool {
        !self.players.is_empty() && self.players.iter().all(|p| p.ready)
    }
}

// --- Spotify token caching (simple blocking client) ---

struct TokenInfo {
    access_token: String,
    expires_at: i64,
}

static SPOTIFY_TOKEN_CACHE: Lazy<Mutex<Option<TokenInfo>>> = Lazy::new(|| Mutex::new(None));

fn fetch_spotify_token() -> Result<TokenInfo, String> {
    let client_id = env::var("SPOTIFY_CLIENT_ID").map_err(|_| "SPOTIFY_CLIENT_ID missing".to_string())?;
    let client_secret = env::var("SPOTIFY_CLIENT_SECRET").map_err(|_| "SPOTIFY_CLIENT_SECRET missing".to_string())?;

    let client = reqwest::blocking::Client::new();
    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(client_id, Some(client_secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .map_err(|e| format!("token request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("spotify token endpoint returned {}", resp.status()));
    }

    let v: serde_json::Value = resp.json().map_err(|e| format!("invalid token json: {}", e))?;
    let access_token = v["access_token"]
        .as_str()
        .ok_or_else(|| "missing access_token".to_string())?
        .to_string();
    let expires_in = v["expires_in"].as_i64().unwrap_or(3600);
    let expires_at = (Utc::now() + Duration::seconds(expires_in - 30)).timestamp();

    Ok(TokenInfo { access_token, expires_at })
}

pub fn get_spotify_token() -> Result<String, String> {
    let mut cache = SPOTIFY_TOKEN_CACHE.lock().map_err(|_| "lock error".to_string())?;
    let now = Utc::now().timestamp();
    if let Some(t) = cache.as_ref() {
        if t.expires_at > now {
            return Ok(t.access_token.clone());
        }
    }

    let new = fetch_spotify_token()?;
    let token = new.access_token.clone();
    *cache = Some(new);
    Ok(token)
}

pub fn search_spotify(query: &str, limit: usize) -> Result<Vec<Song>, String> {
    let token = get_spotify_token()?;
    let client = reqwest::blocking::Client::new();
    let url = format!(
        "https://api.spotify.com/v1/search?q={}&type=track&limit={}",
        urlencoding::encode(query),
        limit
    );
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .map_err(|e| format!("search request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("spotify search returned {}", resp.status()));
    }

    let v: serde_json::Value = resp.json().map_err(|e| format!("invalid search json: {}", e))?;
    let mut out = vec![];
    if let Some(items) = v["tracks"]["items"].as_array() {
        for it in items.iter() {
            let id = it["id"].as_str().unwrap_or_default().to_string();
            let name = it["name"].as_str().unwrap_or_default().to_string();
            let artists = it["artists"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .map(|a| a["name"].as_str().unwrap_or_default().to_string())
                        .collect()
                })
                .unwrap_or_default();
            let album_cover_url = it["album"]["images"]
                .as_array()
                .and_then(|imgs| imgs.first())
                .and_then(|img| img["url"].as_str())
                .map(|s| s.to_string());
            let preview_url = it["preview_url"].as_str().map(|s| s.to_string());

            out.push(Song {
                id,
                name,
                artists,
                album_cover_url,
                preview_url,
                submitted_by: String::new(),
            });
        }
    }
    Ok(out)
}

// --- Gameplay reducers (in-memory helpers) ---

pub fn submit_seed_song(room: &mut Room, song: Song) -> Result<(), String> {
    // ensure only one seed per host for now
    if room.state != GameState::SeedSelection {
        return Err("not in seed selection state".into());
    }
    room.songs.push(song);
    Ok(())
}

pub fn submit_song(room: &mut Room, song: Song) -> Result<(), String> {
    if room.state != GameState::Submission && room.state != GameState::SeedSelection {
        return Err("not accepting submissions".into());
    }
    room.songs.push(song);
    Ok(())
}

pub fn submit_rating(room: &mut Room, rating: Rating) -> Result<(), String> {
    // prevent duplicate rating by same rater for same song
    if room.ratings.iter().any(|r| r.rater_id == rating.rater_id && r.song_id == rating.song_id) {
        return Err("already rated".into());
    }
    room.ratings.push(rating);
    Ok(())
}

pub fn calculate_scores(room: &Room) -> HashMap<String, i32> {
    let mut song_score: HashMap<String, i32> = HashMap::new();
    for r in &room.ratings {
        *song_score.entry(r.song_id.clone()).or_default() += r.points;
    }

    let mut player_scores: HashMap<String, i32> = HashMap::new();
    for s in &room.songs {
        let sc = song_score.get(&s.id).cloned().unwrap_or(0);
        *player_scores.entry(s.submitted_by.clone()).or_default() += sc;
    }
    player_scores
}

pub fn reset_for_next_round(room: &mut Room) {
    room.songs.clear();
    room.ratings.clear();
    room.state = GameState::SeedSelection;
    for p in room.players.iter_mut() {
        p.ready = false;
    }
}

// --- Room lifecycle helpers used by tests / API ---

pub fn create_room(id: &str, name: &str, host_name: &str, max_players: usize) -> Room {
    let host = Player {
        id: "player-1".to_string(),
        name: host_name.to_string(),
        is_host: true,
        ready: false,
    };
    Room::new(id, name, host, max_players)
}

pub fn join_room(room: &mut Room, player_name: &str) -> Result<String, String> {
    if room.players.len() >= room.max_players {
        return Err("room full".into());
    }
    let id = format!("player-{}", room.players.len() + 1);
    let p = Player {
        id: id.clone(),
        name: player_name.to_string(),
        is_host: false,
        ready: false,
    };
    room.players.push(p);
    Ok(id)
}

pub fn set_player_ready(room: &mut Room, player_id: &str, ready: bool) -> Result<(), String> {
    room.set_ready(player_id, ready)
}

pub fn start_game(room: &mut Room) -> Result<(), String> {
    if !room.all_ready() {
        return Err("not all ready".into());
    }
    room.state = GameState::SeedSelection;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_join_room() {
        let mut r = create_room("r1", "Test Room", "Alice", 4);
        assert_eq!(r.players.len(), 1);
        let bob_id = join_room(&mut r, "Bob").unwrap();
        assert_eq!(r.players.len(), 2);
        assert!(r.players.iter().any(|p| p.id == bob_id));
    }

    #[test]
    fn start_game_requires_all_ready() {
        let mut r = create_room("r2", "Room2", "Host", 3);
        join_room(&mut r, "P2").unwrap();
        // not all ready yet
        assert!(start_game(&mut r).is_err());
        // set ready for both
        set_player_ready(&mut r, "player-1", true).unwrap();
        set_player_ready(&mut r, "player-2", true).unwrap();
        assert!(start_game(&mut r).is_ok());
        assert_eq!(r.state, GameState::SeedSelection);
    }

    #[test]
    fn scoring_basic() {
        let mut r = create_room("r3", "Scoring", "H", 4);
        let s1 = Song { id: "s1".into(), name: "Song 1".into(), artists: vec!["A".into()], album_cover_url: None, preview_url: None, submitted_by: "player-1".into() };
        let s2 = Song { id: "s2".into(), name: "Song 2".into(), artists: vec!["B".into()], album_cover_url: None, preview_url: None, submitted_by: "player-2".into() };
        r.songs.push(s1.clone());
        r.songs.push(s2.clone());
        r.ratings.push(Rating { rater_id: "player-2".into(), song_id: "s1".into(), points: 5 });
        r.ratings.push(Rating { rater_id: "player-1".into(), song_id: "s2".into(), points: 3 });
        let scores = calculate_scores(&r);
        assert_eq!(scores.get("player-1").cloned().unwrap_or(0), 5);
        assert_eq!(scores.get("player-2").cloned().unwrap_or(0), 3);
    }
}
