package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/AZURIIEAL/openscale/control-plane/internal/lake"
)

// LakeHandler serves the Data Catalog's MinIO lake browser -- a read-only
// inventory of the openscale-lake bucket's known prefixes (Bronze, Silver,
// Silver quarantine, and the four Gold sub-layers). Deliberately just
// listing metadata (key/size/last-modified), not reading Parquet content:
// there's no row-count/byte-size tracking anywhere else in this repo either
// (Gold's write path explicitly skips row counts to avoid a full-dataset
// Spark scan -- see internal/jobs), so this handler doesn't try to
// reconstruct one; object listing is the honest, real metric available.
type LakeHandler struct {
	client *lake.Client
}

func NewLakeHandler(client *lake.Client) *LakeHandler {
	return &LakeHandler{client: client}
}

const lakeListTimeout = 5 * time.Second

// lakePrefixes are the seven known locations the worker's Spark jobs write
// to (see worker/spark/... -- bronze/, silver/trips/, silver/quarantine/,
// and gold/{daily_revenue,hourly_demand,zone_stats,congestion_metrics}/).
// Hardcoded, not discovered: this app doesn't have (and doesn't need) a
// generic prefix-discovery mechanism, these seven are the whole lake.
var lakePrefixes = []struct {
	name   string
	prefix string
}{
	{"bronze", "bronze/yellow_taxi/"},
	{"silver", "silver/trips/"},
	{"silver-quarantine", "silver/quarantine/"},
	{"gold-daily-revenue", "gold/daily_revenue/"},
	{"gold-hourly-demand", "gold/hourly_demand/"},
	{"gold-zone-stats", "gold/zone_stats/"},
	{"gold-congestion-metrics", "gold/congestion_metrics/"},
}

type LakeLayer struct {
	Name        string        `json:"name"`
	Prefix      string        `json:"prefix"`
	Objects     []lake.Object `json:"objects"`
	ObjectCount int           `json:"objectCount"`
	TotalBytes  int64         `json:"totalBytes"`
}

type LakeCatalog struct {
	Layers    []LakeLayer `json:"layers"`
	Reachable bool        `json:"reachable"`
}

// List handles GET /api/catalog/lake. Always responds HTTP 200 -- a MinIO
// connectivity failure (container not up yet, briefly restarting) is a
// normal state for this screen to represent as reachable:false, not a
// transport error, mirroring streaming_handler.go's Topics
// (brokerReachable) and query_handler.go's Run conventions exactly.
func (h *LakeHandler) List(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	layers := make([]LakeLayer, 0, len(lakePrefixes))
	for _, p := range lakePrefixes {
		ctx, cancel := context.WithTimeout(r.Context(), lakeListTimeout)
		objects, err := h.client.ListPrefix(ctx, p.prefix)
		cancel()
		if err != nil {
			_ = json.NewEncoder(w).Encode(LakeCatalog{Layers: []LakeLayer{}, Reachable: false})
			return
		}

		if objects == nil {
			objects = []lake.Object{}
		}
		var totalBytes int64
		for _, obj := range objects {
			totalBytes += obj.SizeBytes
		}
		layers = append(layers, LakeLayer{
			Name:        p.name,
			Prefix:      p.prefix,
			Objects:     objects,
			ObjectCount: len(objects),
			TotalBytes:  totalBytes,
		})
	}

	_ = json.NewEncoder(w).Encode(LakeCatalog{Layers: layers, Reachable: true})
}
