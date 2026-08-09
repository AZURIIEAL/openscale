// Package config loads control-plane runtime settings from the environment.
package config

import (
	"fmt"

	"github.com/caarlos0/env/v11"
)

// Config holds every setting the control-plane needs at startup. Nothing
// downstream reads os.Getenv directly -- this struct is the single source
// of truth, built once in main and passed down.
type Config struct {
	Port           string `env:"PORT" envDefault:"8080"`
	FrontendOrigin string `env:"FRONTEND_ORIGIN" envDefault:"http://localhost:5173"`

	// DockerHost overrides the Docker Engine API endpoint. Empty means
	// "let the SDK decide" (DOCKER_HOST env var, or the platform default
	// -- npipe on Windows, unix socket on Linux/macOS).
	DockerHost string `env:"DOCKER_HOST"`
}

// Load reads Config from the process environment, applying defaults for
// anything unset.
func Load() (Config, error) {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return Config{}, fmt.Errorf("config: parse env: %w", err)
	}
	return cfg, nil
}
