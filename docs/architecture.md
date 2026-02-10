# Architecture Notes

## Request path

CloudFront -> S3 (frontend) and API Gateway -> Lambda (backend) -> DynamoDB.

## DynamoDB tables

- `Sessions`
  - `session_id` (PK)
  - `study_id`, `prolific_pid`, `prolific_session_id`
  - `status`, `stage`, `lease_token`, `lease_expires_at_utc`
  - `calibration_group`, `ms_per_word`
- `ParticipantLocks`
  - `pk = STUDY#<study_id>#PID#<prolific_pid>`
  - Used for uniqueness/duplicate prevention via conditional writes
- `Events`
  - `pk = session_id`
  - `sk = run_id#client_event_seq`
  - immutable append-only events with server receipt timestamp
- `AssignmentCounters`
  - `pk = stimuli_version`
  - `sk = stimulus_id`
  - `assigned_count`, `target_count`

## Restart policy

Policy 2: refresh restarts current stimulus from word 0 with a new `run_id`.
Prior run events remain auditable and are uploaded from outbox on resume.
