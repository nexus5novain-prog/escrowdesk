REVOKE EXECUTE ON FUNCTION public.warn_user(uuid, uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ban_user(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.unban_user(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_role(uuid, uuid, app_role) FROM anon, public;