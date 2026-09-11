"""Génère un certificat HTTPS auto-signé pour une IP donnée — utilisé par
previarun (Linux ET Windows) au lieu de dépendre de la commande `openssl`
(pas installée par défaut sur Windows, pas toujours dans le PATH même sur
Linux) : Python + le paquet `cryptography` (déjà nécessaire ailleurs dans
l'écosystème Python de ce projet) suffisent, sur les deux systèmes.

Usage : python generer_certificat.py <ip> <chemin_cert.pem> <chemin_key.pem>"""
import datetime
import ipaddress
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def generer(ip: str, chemin_cert: str, chemin_key: str) -> None:
    cle = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    sujet = emetteur = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, ip)])

    noms_alternatifs = [
        x509.IPAddress(ipaddress.ip_address(ip)),
        x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
        x509.DNSName("localhost"),
    ]

    maintenant = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(sujet)
        .issuer_name(emetteur)
        .public_key(cle.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(maintenant)
        .not_valid_after(maintenant + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(noms_alternatifs), critical=False)
        .sign(cle, hashes.SHA256())
    )

    with open(chemin_key, "wb") as f:
        f.write(cle.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    with open(chemin_cert, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))


def couvre_deja_cette_ip(chemin_cert: str, ip: str) -> bool:
    """Vrai si le certificat existant couvre déjà `ip` — évite de
    régénérer (et de redéclencher l'avertissement navigateur) si le
    réseau n'a pas changé depuis le dernier lancement."""
    try:
        with open(chemin_cert, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())
        ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        return ip in [str(v) for v in ext.value.get_values_for_type(x509.IPAddress)]
    except Exception:
        return False


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage : python generer_certificat.py <ip> <cert.pem> <key.pem>", file=sys.stderr)
        sys.exit(1)
    ip_cible, chemin_cert, chemin_key = sys.argv[1], sys.argv[2], sys.argv[3]

    if couvre_deja_cette_ip(chemin_cert, ip_cible):
        print("INCHANGE")
    else:
        generer(ip_cible, chemin_cert, chemin_key)
        print("REGENERE")
