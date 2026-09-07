BEGIN;

LOCK TABLE public."user" IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.provision_application_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.uzytkownicy (id_uzytkownika, uprawnienia, service_key)
  VALUES (NEW.id, 'mieszkaniec', NULL)
  ON CONFLICT (id_uzytkownika) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_provision_application_role ON public."user";
CREATE TRIGGER user_provision_application_role
AFTER INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.provision_application_user();

INSERT INTO public.uzytkownicy (id_uzytkownika, uprawnienia, service_key)
SELECT id, 'mieszkaniec', NULL FROM public."user"
ON CONFLICT (id_uzytkownika) DO NOTHING;

COMMIT;
