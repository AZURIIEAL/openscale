package streaming

import "testing"

func TestTopicAllowed(t *testing.T) {
	cases := map[string]bool{
		"demo.trips":         true,
		"demo.":              false,
		"demo-2.trips":       false,
		"yellow-taxi-trips":  false,
		"demox.trips":        false,
		"demo.trips.archive": true,
	}
	for topic, want := range cases {
		if got := TopicAllowed("demo", topic); got != want {
			t.Errorf("TopicAllowed(demo, %q) = %v, want %v", topic, got, want)
		}
	}
}

func TestMessageValue(t *testing.T) {
	if got := string(messageValue([]byte(`{"a":1}`))); got != `{"a":1}` {
		t.Errorf("json passes through: %s", got)
	}
	if got := string(messageValue([]byte(`not json`))); got != `"not json"` {
		t.Errorf("text is quoted: %s", got)
	}
}
