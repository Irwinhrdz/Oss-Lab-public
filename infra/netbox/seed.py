# Crea el Site/Device del gNB simulado y un API token para el middleware.
# Correr dentro del contenedor: docker compose exec netbox manage.py shell -c "exec(open('/tmp/seed.py').read())"
# (copiar primero el archivo al contenedor con `docker compose cp seed.py netbox:/tmp/seed.py`)
from dcim.models import Site, Manufacturer, DeviceType, DeviceRole, Device
from users.models import Token
from users.choices import TokenVersionChoices
from django.contrib.auth import get_user_model

User = get_user_model()

site, _ = Site.objects.get_or_create(
    slug="skb837",
    defaults={"name": "SKB837 - St Kitts gNB Simulado", "status": "active"},
)
if site.status != "active":
    site.status = "active"
    site.save()

manufacturer, _ = Manufacturer.objects.get_or_create(
    slug="ericsson", defaults={"name": "Ericsson"}
)

device_type, _ = DeviceType.objects.get_or_create(
    slug="baseband-6630",
    manufacturer=manufacturer,
    defaults={"model": "Baseband 6630"},
)

role, _ = DeviceRole.objects.get_or_create(
    slug="gnb", defaults={"name": "gNB", "color": "2196f3"}
)

device, _ = Device.objects.get_or_create(
    name="gnb-skb837-sim",
    site=site,
    defaults={"device_type": device_type, "role": role, "status": "active"},
)

user = User.objects.get(username="admin")
Token.objects.filter(user=user, description="middleware").delete()
# v1 explícito: el middleware espera "Authorization: Token <valor>". Los tokens v2
# (default en NetBox 4.7+) usan un esquema Bearer distinto (ver README de esta carpeta).
token = Token(user=user, description="middleware", version=TokenVersionChoices.V1)
token.save()

print("SITE_SLUG=" + site.slug)
print("DEVICE=" + device.name)
print("NETBOX_API_TOKEN=" + token.plaintext)
