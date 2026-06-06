use std::env;
use std::collections::HashMap;
use tiny_http::{Server, Response, Method};
use pass_the_aux_backend as backend;

fn parse_query(qs: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for part in qs.split('&') {
        if part.is_empty() { continue }
        let mut kv = part.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        let k = urlencoding::decode(k).unwrap_or_else(|_| k.into()).into_owned();
        let v = urlencoding::decode(v).unwrap_or_else(|_| v.into()).into_owned();
        m.insert(k, v);
    }
    m
}

fn json_response(code: u16, body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(code)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap())
}

fn main() {
    let port = env::var("BACKEND_PORT").unwrap_or_else(|_| "8080".into());
    let addr = format!("0.0.0.0:{}", port);
    let server = Server::http(&addr).expect("failed to bind server");
    println!("Backend HTTP server listening on {}", addr);

    for request in server.incoming_requests() {
        let url = request.url();
        let (path, qs) = if let Some(idx) = url.find('?') { (&url[..idx], Some(&url[idx+1..])) } else { (url, None) };

        if path == "/spotify/search" && request.method() == &Method::Get {
            let mut q = "".to_string();
            let mut limit = 10usize;
            if let Some(qs) = qs {
                let params = parse_query(qs);
                if let Some(v) = params.get("q") { q = v.clone(); }
                if let Some(v) = params.get("limit") { limit = v.parse().unwrap_or(10); }
            }
            match backend::search_spotify(&q, limit) {
                Ok(songs) => {
                    let body = serde_json::to_string(&songs).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e));
                    let resp = json_response(200, body);
                    let _ = request.respond(resp);
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let resp = json_response(500, body);
                    let _ = request.respond(resp);
                }
            }
            continue;
        }

        if path == "/spotify/token" && request.method() == &Method::Get {
            match backend::get_spotify_token() {
                Ok(tok) => {
                    let body = serde_json::json!({"access_token": tok}).to_string();
                    let resp = json_response(200, body);
                    let _ = request.respond(resp);
                }
                Err(e) => {
                    let body = serde_json::json!({"error": e}).to_string();
                    let resp = json_response(500, body);
                    let _ = request.respond(resp);
                }
            }
            continue;
        }

        // fallback
        let body = serde_json::json!({"error": "not found"}).to_string();
        let resp = json_response(404, body);
        let _ = request.respond(resp);
    }
}
