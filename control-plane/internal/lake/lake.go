// Package lake wraps the MinIO (S3-compatible) client for the
// openscale-lake bucket -- mirrors the isolation convention already used
// for internal/redis, internal/docker, and internal/streaming: one package
// per external system, nothing outside this package talks to the
// underlying SDK (minio-go) directly. Reads list objects; the only writes
// are the dataset raw-file upload (PutObject) and dataset removal
// (DeletePrefix) -- the worker writes everything else.
package lake

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Bucket is the lake's single bucket name -- matches LAKE_BUCKET in
// worker/spark/common/storage.py and libs/openscale. Exported so the
// query engine's dataset paths (s3://{Bucket}/...) can be built from it.
const Bucket = "openscale-lake"

const bucket = Bucket

// Client is a thin wrapper around minio-go's client, scoped to the
// openscale-lake bucket.
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

// uploadPartSize bounds memory per in-flight upload. minio-go buffers one
// part at a time for a reader of unknown length, and its default part size
// for that case is large (hundreds of MB, sized for the 5 TB object cap);
// 16 MiB keeps a 200 MB upload well under the file's own size in RAM.
const uploadPartSize = 16 * 1024 * 1024

// PutObject streams body to key without buffering the whole object. size
// may be -1 when unknown (a multipart upload part), in which case minio-go
// uses a multipart upload with uploadPartSize parts.
func (c *Client) PutObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) (int64, error) {
	info, err := c.mc.PutObject(ctx, bucket, key, body, size, minio.PutObjectOptions{
		ContentType: contentType,
		PartSize:    uploadPartSize,
	})
	if err != nil {
		return 0, fmt.Errorf("lake: put %q: %w", key, err)
	}
	return info.Size, nil
}

// DeletePrefix removes every object under prefix. A prefix with nothing
// under it is not an error.
func (c *Client) DeletePrefix(ctx context.Context, prefix string) error {
	if !strings.HasSuffix(prefix, "/") {
		return fmt.Errorf("lake: refusing to delete non-directory prefix %q", prefix)
	}
	objectCh := c.mc.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true})
	for result := range c.mc.RemoveObjects(ctx, bucket, objectCh, minio.RemoveObjectsOptions{}) {
		if result.Err != nil && !isNotFound(result.Err) {
			return fmt.Errorf("lake: delete %q: %w", result.ObjectName, result.Err)
		}
	}
	return nil
}
