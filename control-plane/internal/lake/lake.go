// Package lake wraps the MinIO (S3-compatible) client for read-only access
// to the openscale-lake bucket -- mirrors the isolation convention already
// used for internal/redis, internal/docker, and internal/streaming: one
// package per external system, nothing outside this package talks to the
// underlying SDK (minio-go) directly.
package lake

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// bucket is the lake's single bucket name -- matches LAKE_BUCKET in
// worker/spark/common/storage.py. Not configurable anywhere else in this
// repo either, so it's hardcoded here too rather than threaded through
// config for no real benefit.
const bucket = "openscale-lake"

// Client is a thin, read-only wrapper around minio-go's client, scoped to
// the openscale-lake bucket.
type Client struct {
	mc *minio.Client
}

// NewClient builds a Client from raw endpoint/access/secret key config.
// minio.New wants a bare host:port endpoint (no http://https:// scheme) and
// a separate Secure bool, so a leading scheme on endpoint is stripped here
// first -- passing the raw "http://minio:9000" straight into minio.New
// fails.
func NewClient(endpoint, accessKey, secretKey string) (*Client, error) {
	host, secure := stripScheme(endpoint)
	mc, err := minio.New(host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, fmt.Errorf("lake: build minio client: %w", err)
	}
	return &Client{mc: mc}, nil
}

func stripScheme(endpoint string) (host string, secure bool) {
	switch {
	case strings.HasPrefix(endpoint, "https://"):
		return strings.TrimPrefix(endpoint, "https://"), true
	case strings.HasPrefix(endpoint, "http://"):
		return strings.TrimPrefix(endpoint, "http://"), false
	default:
		return endpoint, false
	}
}

// Object is one lake object's listing metadata -- key, size, and
// last-modified time, exactly what MinIO's own object listing provides.
// There's no row-count/schema info here: Parquet's actual row count would
// require reading the file, not just listing it, which this package
// deliberately doesn't do (see lake_handler.go's doc comment).
type Object struct {
	Key          string    `json:"key"`
	SizeBytes    int64     `json:"sizeBytes"`
	LastModified time.Time `json:"lastModified"`
}

// ListPrefix lists every real object under prefix, recursively, skipping
// Spark's empty "_SUCCESS" completion markers and any bare "directory"
// placeholder object (a key ending in "/") -- neither is real data, both
// would just be noise in a lake browser. Returns (nil, nil), not an error,
// when the prefix simply doesn't exist yet (no ingest/job has written there
// yet) -- matches this app's "empty is a normal state, not a failure"
// convention (see db.ListQueryCatalog's doc comment for the same philosophy
// on the Postgres side). A real error is reserved for an actual
// connectivity/auth failure talking to MinIO.
func (c *Client) ListPrefix(ctx context.Context, prefix string) ([]Object, error) {
	objectCh := c.mc.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	objects := []Object{}
	for obj := range objectCh {
		if obj.Err != nil {
			if isNotFound(obj.Err) {
				return nil, nil
			}
			return nil, fmt.Errorf("lake: list prefix %q: %w", prefix, obj.Err)
		}
		if strings.HasSuffix(obj.Key, "_SUCCESS") || strings.HasSuffix(obj.Key, "/") {
			continue
		}
		objects = append(objects, Object{
			Key:          obj.Key,
			SizeBytes:    obj.Size,
			LastModified: obj.LastModified,
		})
	}
	return objects, nil
}

func isNotFound(err error) bool {
	var errResp minio.ErrorResponse
	if errors.As(err, &errResp) {
		return errResp.Code == "NoSuchBucket" || errResp.Code == "NoSuchKey"
	}
	return false
}
