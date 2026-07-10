"""Emails transactionnels liés aux organisations."""

from django.conf import settings
from django.core.mail import EmailMultiAlternatives


def send_invitation_email(user, invitation_url):
    """Invitation à définir son mot de passe — texte brut + HTML aux couleurs Horus."""
    display_name = user.first_name or user.last_name
    logo_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/brand/horus-assur-logo.png"

    text_body = (
        f"Bonjour {display_name},\n\n"
        "Votre compte Horus Assurances Digital a été créé. "
        f"Votre identifiant est {user.username}. "
        f"Définissez votre mot de passe ici : {invitation_url}\n"
    )

    html_body = f"""\
<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background-color:#f5f6f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <img src="{logo_url}" alt="Horus Assur" height="56" style="height:56px;width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #e2e5ee;border-radius:16px;padding:36px 32px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#0d0f17;">
                  Bienvenue sur Horus Assurances Digital
                </h1>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b4f5c;">
                  Bonjour <strong>{display_name}</strong>,
                </p>
                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4b4f5c;">
                  Votre compte a été créé sur la plateforme de gestion
                  d&rsquo;assurance automobile Horus.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b4f5c;">
                  Votre identifiant&nbsp;:
                  <strong style="display:inline-block;background-color:#f5eafc;color:#7800a0;padding:2px 10px;border-radius:6px;font-size:14px;">{user.username}</strong>
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>
                    <td style="border-radius:12px;background:linear-gradient(135deg,#9600c0,#7800a0);background-color:#9600c0;">
                      <a href="{invitation_url}"
                         style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">
                        Définir mon mot de passe
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#9095a3;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br />
                  <a href="{invitation_url}" style="color:#9600c0;word-break:break-all;">{invitation_url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:20px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
                <p style="margin:0;font-size:11px;color:#9095a3;">
                  Horus Assurances Digital — Plateforme réservée aux agents agréés<br />
                  Si vous n&rsquo;êtes pas à l&rsquo;origine de cette demande, ignorez cet email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    email = EmailMultiAlternatives(
        subject="Invitation Horus Assurances Digital",
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    email.attach_alternative(html_body, "text/html")
    email.send(fail_silently=False)
