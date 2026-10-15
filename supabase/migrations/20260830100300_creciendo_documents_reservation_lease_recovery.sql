-- Reservation timestamps are a renewable lease, not storage identity.
-- Keep the document path, scope, metadata, idempotency and uploader immutable.

create or replace function app_private.reject_document_storage_identity_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id,new.care_space_id,new.child_id,new.bucket_id,new.object_path,new.purpose,new.declared_mime_type,
      new.expected_size_bytes,new.expected_sha256,new.retention_class,new.reservation_nonce_sha256,
      new.reservation_idempotency_key,new.reservation_request_sha256,new.uploaded_by)
    is distinct from
    row(old.id,old.care_space_id,old.child_id,old.bucket_id,old.object_path,old.purpose,old.declared_mime_type,
      old.expected_size_bytes,old.expected_sha256,old.retention_class,old.reservation_nonce_sha256,
      old.reservation_idempotency_key,old.reservation_request_sha256,old.uploaded_by)
  then raise check_violation using message = 'document storage identity is immutable'; end if;
  return new;
end;
$$;
