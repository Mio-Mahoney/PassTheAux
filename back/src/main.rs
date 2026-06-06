#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    pass_the_aux_backend::server::run().await
}
