package datasets

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateName(t *testing.T) {
	for _, ok := range []string{"a", "orders", "sales_q3_2025", "d_2024", strings.Repeat("x", 63)} {
		if err := ValidateName(ok); err != nil {
			t.Errorf("ValidateName(%q) = %v, want nil", ok, err)
		}
	}
	for _, bad := range []string{"", "Orders", "2024", "_lead", "has space", "has-hyphen", "dot.name", strings.Repeat("x", 64), "sales;drop"} {
		if err := ValidateName(bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("ValidateName(%q) = %v, want ErrInvalid", bad, err)
		}
	}
}

func TestNameFromFilename(t *testing.T) {
	cases := map[string]string{
		"Sales Q3-2025.csv":               "sales_q3_2025",
		"yellow_tripdata_2024-07.parquet": "yellow_tripdata_2024_07",
		"data.csv.gz":                     "data",
		"C:\\Users\\me\\Report.CSV":       "report",
		"/tmp/x/orders.jsonl":             "orders",
		"2024.csv":                        "d_2024",
		"!!!.csv":                         "dataset",
		"":                                "dataset",
		"___x___.csv":                     "x",
		strings.Repeat("a", 80) + ".csv":  strings.Repeat("a", 63),
	}
	for in, want := range cases {
		got := NameFromFilename(in)
		if got != want {
			t.Errorf("NameFromFilename(%q) = %q, want %q", in, got, want)
		}
		if err := ValidateName(got); err != nil {
			t.Errorf("NameFromFilename(%q) produced invalid name %q: %v", in, got, err)
		}
	}
}

func TestIsSupportedFilename(t *testing.T) {
	for _, ok := range []string{"a.csv", "A.CSV", "a.tsv", "a.parquet", "a.json", "a.jsonl", "a.ndjson", "a.csv.gz", "dir/a.json.gz"} {
		if !IsSupportedFilename(ok) {
			t.Errorf("%q should be supported", ok)
		}
	}
	for _, bad := range []string{"a.xlsx", "a.txt", "a", "a.gz", "a.zip", "a.parquet.zip"} {
		if IsSupportedFilename(bad) {
			t.Errorf("%q should not be supported", bad)
		}
	}
}

func TestValidateSourceURL(t *testing.T) {
	for _, ok := range []string{
		"https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-07.parquet",
		"http://example.com/data.csv",
		"https://example.com:8443/a/b?c=d",
	} {
		if err := ValidateSourceURL(ok); err != nil {
			t.Errorf("ValidateSourceURL(%q) = %v, want nil", ok, err)
		}
	}
	bad := map[string]string{
		"":                              "required",
		"ftp://example.com/x":           "http or https",
		"file:///etc/passwd":            "http or https",
		"https://":                      "no host",
		"not a url":                     "http or https",
		"https://user:pw@example.com/x": "credentials",
		"http://localhost:8080/x":       "private or local",
		"http://foo.localhost/x":        "private or local",
		"http://minio.internal/x":       "private or local",
		"http://127.0.0.1/x":            "private or local",
		"http://10.0.0.5/x":             "private or local",
		"http://192.168.1.1/x":          "private or local",
		"http://172.16.0.1/x":           "private or local",
		"http://169.254.169.254/latest": "private or local",
		"http://[::1]/x":                "private or local",
		"http://0.0.0.0/x":              "private or local",
		"https://example.com/" + strings.Repeat("x", 2100): "too long",
	}
	for in, want := range bad {
		err := ValidateSourceURL(in)
		if err == nil {
			t.Errorf("ValidateSourceURL(%q) = nil, want error containing %q", in, want)
			continue
		}
		if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), want) {
			t.Errorf("ValidateSourceURL(%q) = %v, want ErrInvalid containing %q", in, err, want)
		}
	}
}

func TestFilenameFromURL(t *testing.T) {
	cases := map[string]string{
		"https://example.com/trip-data/yellow_2024-07.parquet": "yellow_2024-07.parquet",
		"https://example.com/data.csv?download=1":              "data.csv",
		"https://example.com/":                                 "download",
		"https://example.com":                                  "download",
		"::not a url::":                                        "download",
	}
	for in, want := range cases {
		if got := FilenameFromURL(in); got != want {
			t.Errorf("FilenameFromURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLakeLayout(t *testing.T) {
	p, d := "p1", "d1"
	if got := Prefix(p, d); got != "projects/p1/datasets/d1/" {
		t.Errorf("Prefix = %q", got)
	}
	if got := RawPrefix(p, d); got != "projects/p1/datasets/d1/raw/" {
		t.Errorf("RawPrefix = %q", got)
	}
	if got := DataPrefix(p, d); got != "projects/p1/datasets/d1/data/" {
		t.Errorf("DataPrefix = %q", got)
	}
	if got := RawObjectKey(p, d, "../../etc/passwd"); got != "projects/p1/datasets/d1/raw/passwd" {
		t.Errorf("RawObjectKey escaped the prefix: %q", got)
	}
}

func TestSafeObjectName(t *testing.T) {
	cases := map[string]string{
		"Sales Q3.csv":      "Sales_Q3.csv",
		"../../x.csv":       "x.csv",
		"C:\\dir\\file.csv": "file.csv",
		"..":                "file",
		"":                  "file",
		"ünïcode.parquet":   "_n_code.parquet",
		"ok-name_1.csv.gz":  "ok-name_1.csv.gz",
	}
	for in, want := range cases {
		if got := SafeObjectName(in); got != want {
			t.Errorf("SafeObjectName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeLayer(t *testing.T) {
	if got, err := NormalizeLayer(""); err != nil || got != LayerBronze {
		t.Errorf("empty layer: got %q, %v", got, err)
	}
	for _, ok := range []string{LayerBronze, LayerSilver, LayerGold} {
		if got, err := NormalizeLayer(ok); err != nil || got != ok {
			t.Errorf("layer %q: got %q, %v", ok, got, err)
		}
	}
	if _, err := NormalizeLayer("platinum"); !errors.Is(err, ErrInvalid) {
		t.Errorf("platinum: got %v", err)
	}
}
