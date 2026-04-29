from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="")

    rl_server_host: str = "127.0.0.1"
    rl_server_port: int = 8001
    rl_api_key: str = "change-me"
    model_dir: str = "/tmp/rl-inference/models"
    log_level: str = "INFO"


def get_settings() -> Settings:
    return Settings()
