-- Two audit-preserving pilot attempts at most; task.target_calls controls whether
-- any specific operator is authorized for a second call.
alter table public.david_task_call_attempts
 add column if not exists attempt_number smallint not null default 1;
alter table public.david_task_call_attempts
 drop constraint if exists david_task_call_attempts_worker_user_id_task_date_key;
alter table public.david_task_call_attempts
 drop constraint if exists david_task_call_attempt_number_limited;
alter table public.david_task_call_attempts
 add constraint david_task_call_attempt_number_limited check (attempt_number in (1,2));
alter table public.david_task_call_attempts
 add constraint david_task_call_attempts_worker_date_number_unique
 unique(worker_user_id,task_date,attempt_number);
