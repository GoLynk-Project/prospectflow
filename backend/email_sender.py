import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def replace_vars(text, prospect):
    return (text or "").replace("{name}", prospect.get("name","")).replace("{nom}", prospect.get("name","")).replace("{company}", prospect.get("company","")).replace("{entreprise}", prospect.get("company","")).replace("{email}", prospect.get("email",""))

def build_html(body_text, prospect, base_url):
    lines = body_text.split("\n")
    body_html = "".join(f'<p style="margin:0 0 12px;line-height:1.6;color:#333;">{l}</p>' if l.strip() else "<br/>" for l in lines)
    tid = prospect.get("tracking_id","")
    utk = prospect.get("unsubscribe_token","")
    return f'''<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#333;max-width:600px;margin:0 auto;padding:20px;">
{body_html}
<div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
<a href="{base_url}/unsubscribe/{utk}" style="color:#9ca3af;text-decoration:underline;">I no longer wish to be contacted</a>
</div>
<img src="{base_url}/track/open/{tid}" width="1" height="1" style="display:none;" alt="" />
</body></html>'''

def send_email(smtp_config, to_email, subject, html_body, unsubscribe_url=""):
    """Send email via SMTP. Returns (success, error_message, is_bounce)"""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f'{smtp_config.get("sender_name","")} <{smtp_config["email"]}>' if smtp_config.get("sender_name") else smtp_config["email"]
        msg["To"] = to_email
        msg["Subject"] = subject
        if unsubscribe_url:
            msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        port = int(smtp_config.get("port", 587))
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_config["host"], port, timeout=30)
        else:
            server = smtplib.SMTP(smtp_config["host"], port, timeout=30)
            server.starttls()

        server.login(smtp_config["email"], smtp_config["password"])
        server.sendmail(smtp_config["email"], to_email, msg.as_string())
        server.quit()
        return True, None, False
    except smtplib.SMTPRecipientsRefused as e:
        return False, str(e), True
    except smtplib.SMTPResponseException as e:
        is_bounce = e.smtp_code in (550, 551, 552, 553, 554)
        return False, f"{e.smtp_code}: {e.smtp_error}", is_bounce
    except Exception as e:
        msg = str(e).lower()
        is_bounce = any(x in msg for x in ["user unknown","no such user","mailbox not found","does not exist","invalid recipient","rejected"])
        return False, str(e), is_bounce
