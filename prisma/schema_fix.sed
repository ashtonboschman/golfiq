# Remove the url line from datasource
/^datasource db {/,/^}/ {
  /url.*env("DATABASE_URL")/d
}

# Fix duplicate index names
133s/name: "idx_course_id"/name: "idx_location_course_id"/
168s/name: "idx_course_id"/name: "idx_tee_course_id"/
186s/name: "idx_tee_id"/name: "idx_hole_tee_id"/
218s/name: "idx_course_id"/name: "idx_round_course_id"/
219s/name: "idx_tee_id"/name: "idx_round_tee_id"/
