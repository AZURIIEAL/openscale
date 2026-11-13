from openscale import paths


def test_layout_matches_control_plane():
    assert paths.dataset_prefix("p1", "d1") == "projects/p1/datasets/d1/"
    assert paths.raw_prefix("p1", "d1") == "projects/p1/datasets/d1/raw/"
    assert paths.data_prefix("p1", "d1") == "projects/p1/datasets/d1/data/"


def test_s3_urls_use_the_bucket():
    assert paths.s3("x/y", bucket="b") == "s3://b/x/y"
    assert paths.data_glob("p1", "d1").endswith("/projects/p1/datasets/d1/data/*.parquet")
    assert paths.data_glob("p1", "d1").startswith("s3://")
    assert paths.raw_glob("p1", "d1").endswith("/raw/*")


def test_data_part_is_zero_padded():
    assert paths.data_part("p", "d").endswith("/data/part-00000.parquet")
    assert paths.data_part("p", "d", 12).endswith("/data/part-00012.parquet")


def test_project_scope_covers_every_dataset_of_the_project():
    scope = paths.project_scope("p1")
    assert paths.data_glob("p1", "d1").startswith(scope)
    assert not paths.data_glob("p2", "d1").startswith(scope)
