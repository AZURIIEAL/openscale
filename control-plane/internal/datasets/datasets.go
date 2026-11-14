// Package datasets holds the dataset domain: the plain type, naming and
// source rules, and the lake layout. Pure like internal/projects --
// internal/db persists it, internal/api serves it, the worker's
// libs/openscale mirrors the path rules in Python.
//
// A dataset is one named table inside a project. Its files live under
// projects/{project_id}/datasets/{dataset_id}/ in the lake: raw/ holds
// files exactly as uploaded or downloaded, data/ holds the Parquet the
// query engine reads. Bronze/Silver/Gold are a label, not a folder.
package datasets

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

// Status is the dataset lifecycle.
type Status string

const (
	// StatusPending: row exists, files may be landing, ingest not finished.
	StatusPending Status = "pending"
	// StatusReady: data/ holds Parquet and columns/profile are populated.
	StatusReady Status = "ready"
	// StatusFailed: fetch or ingest failed; Error says why.
	StatusFailed Status = "failed"
)

// Layer is the medallion label shown as a badge and used for lineage.
const (
	LayerBronze = "bronze"
	LayerSilver = "silver"
	LayerGold   = "gold"
)

// SourceKind says where a dataset's raw files come from.
const (
	SourceUpload = "upload"
	SourceURL    = "url"
)

// Source is the JSON blob stored in datasets.source.
type Source struct {
	Kind string `json:"kind"`
	// URL is set for SourceURL.
	URL string `json:"url,omitempty"`
	// Filename is the original client file name for SourceUpload, kept for
	// display only; the stored object is named by the handler.
	Filename string `json:"filename,omitempty"`
}

// Column is one entry of datasets.columns, written by the ingest job from
// DuckDB's inferred schema.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// Dataset mirrors a control_plane.datasets row.
type Dataset struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"projectId"`
	Name      string          `json:"name"`
	Layer     string          `json:"layer"`
	Status    Status          `json:"status"`
	Source    Source          `json:"source"`
	Columns   []Column        `json:"columns"`
	Profile   json.RawMessage `json:"profile,omitempty"`
	RowCount  *int64          `json:"rowCount,omitempty"`
	SizeBytes *int64          `json:"sizeBytes,omitempty"`
	Rules     json.RawMessage `json:"rules"`
	Error     *string         `json:"error,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// ErrInvalid wraps every validation error.
var ErrInvalid = errors.New("invalid dataset")

// namePattern: the name becomes a SQL identifier (the view name in the
// query engine), so it is restricted to a plain lowercase identifier.
// Mirrors the CHECK constraint in migration 0006.
var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`)

// ValidateName checks a dataset name.
func ValidateName(name string) error {
	switch {
	case name == "":
		return fmt.Errorf("%w: name is required", ErrInvalid)
	case !namePattern.MatchString(name):
		return fmt.Errorf("%w: name must start with a letter and contain only lowercase letters, digits and underscores (max 63 chars)", ErrInvalid)
	}
	return nil
}

// NameFromFilename derives a usable dataset name from an uploaded file
// name: strip the extension, lowercase, non-identifier runs to "_", ensure
// it starts with a letter. "Sales Q3-2025.csv" -> "sales_q3_2025".
func NameFromFilename(filename string) string {
	base := path.Base(strings.ReplaceAll(filename, "\\", "/"))
	base = strings.TrimSuffix(base, path.Ext(base))
	// A second extension such as ".csv" in "data.csv.gz".
	base = strings.TrimSuffix(base, path.Ext(base))

	var b strings.Builder
	lastUnderscore := true
	for _, r := range strings.ToLower(base) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	name := strings.Trim(b.String(), "_")
	if name == "" {
		return "dataset"
	}
	if name[0] >= '0' && name[0] <= '9' {
		name = "d_" + name
	}
	if len(name) > 63 {
		name = strings.TrimRight(name[:63], "_")
	}
	return name
}

// SupportedExtensions lists the raw-file formats the ingest job can read.
// Mirrors libs/openscale/openscale/readers.py.
var SupportedExtensions = []string{".csv", ".tsv", ".parquet", ".json", ".jsonl", ".ndjson", ".csv.gz", ".tsv.gz", ".json.gz"}

// IsSupportedFilename reports whether the ingest job can read the file.
func IsSupportedFilename(filename string) bool {
	lower := strings.ToLower(filename)
	for _, ext := range SupportedExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// MaxURLLength caps the stored URL.
const MaxURLLength = 2048

// ValidateSourceURL accepts only http(s) URLs with a host. It does not
// resolve the host: the worker, which actually connects, applies the
// private-address check (libs/openscale url_check), because a DNS-level
// check here could be answered differently by the time the worker fetches.
func ValidateSourceURL(raw string) error {
	if raw == "" {
		return fmt.Errorf("%w: url is required", ErrInvalid)
	}
	if len(raw) > MaxURLLength {
		return fmt.Errorf("%w: url is too long", ErrInvalid)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%w: url is not valid", ErrInvalid)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("%w: url must use http or https", ErrInvalid)
	}
	if u.Host == "" {
		return fmt.Errorf("%w: url has no host", ErrInvalid)
	}
	if u.User != nil {
		return fmt.Errorf("%w: url must not carry credentials", ErrInvalid)
	}
	host := u.Hostname()
	if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()) {
		return fmt.Errorf("%w: url must not point at a private or local address", ErrInvalid)
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".internal") {
		return fmt.Errorf("%w: url must not point at a private or local address", ErrInvalid)
	}
	return nil
}

// FilenameFromURL picks a file name for a URL download: the last path
// segment when it carries a supported extension, else "download" plus the
// extension the Content-Type will have to supply later.
func FilenameFromURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "download"
	}
	name := path.Base(u.Path)
	if name == "" || name == "/" || name == "." {
		return "download"
	}
	return name
}

// Lake layout. Ids, not names, so a rename never moves a file.

// Prefix is the dataset's root in the lake: projects/{p}/datasets/{d}/.
func Prefix(projectID, datasetID string) string {
	return fmt.Sprintf("projects/%s/datasets/%s/", projectID, datasetID)
}

// RawPrefix holds files exactly as uploaded or downloaded.
func RawPrefix(projectID, datasetID string) string {
	return Prefix(projectID, datasetID) + "raw/"
}

// DataPrefix holds the Parquet the query engine reads.
func DataPrefix(projectID, datasetID string) string {
	return Prefix(projectID, datasetID) + "data/"
}

// RawObjectKey names one raw file. The client file name is sanitised to
// a safe object key; the original stays in Source.Filename for display.
func RawObjectKey(projectID, datasetID, filename string) string {
	return RawPrefix(projectID, datasetID) + SafeObjectName(filename)
}

// SafeObjectName strips directories and anything outside a conservative
// character set so a client-supplied name cannot escape the raw/ prefix.
func SafeObjectName(filename string) string {
	base := path.Base(strings.ReplaceAll(filename, "\\", "/"))
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	name := strings.Trim(b.String(), ".")
	if name == "" {
		return "file"
	}
	return name
}

// CreateInput is the JSON body for a URL-sourced dataset, and the field set
// a multipart upload carries alongside the file.
type CreateInput struct {
	Name  string `json:"name"`
	Layer string `json:"layer"`
	URL   string `json:"url"`
}

// NormalizeLayer defaults and validates the layer label.
func NormalizeLayer(layer string) (string, error) {
	switch layer {
	case "":
		return LayerBronze, nil
	case LayerBronze, LayerSilver, LayerGold:
		return layer, nil
	}
	return "", fmt.Errorf("%w: layer must be bronze, silver or gold", ErrInvalid)
}
