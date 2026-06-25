package db

import "database/sql"

func nullString(value string) sql.NullString {
	if value == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}

func nullInt64(value *int64) sql.NullInt64 {
	if value == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *value, Valid: true}
}

func nullInt(value *int) sql.NullInt64 {
	if value == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(*value), Valid: true}
}

func nullFloat64(value float64) sql.NullFloat64 {
	if value == 0 {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: value, Valid: true}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
