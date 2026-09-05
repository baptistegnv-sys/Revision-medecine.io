"""
Vérifie les révisions dues auprès de l'Apps Script (qui lit le Google Sheet)
et envoie une notification push à tous les abonnés pour chacune.

Exécuté automatiquement chaque jour par GitHub Actions (voir
.github/workflows/check-reviews.yml) — aucune machine à faire tourner soi-même.
"""

import json
import os
import requests
from pywebpush import webpush, WebPushException

APPS_SCRIPT_URL = os.environ["APPS_SCRIPT_URL"]
VAPID_PRIVATE_KEY = os.environ["VAPID_PRIVATE_KEY"]   # contenu du .pem, en variable d'env
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:exemple@example.com")
GITHUB_PAGES_URL = os.environ["GITHUB_PAGES_URL"]     # ex: https://votre-pseudo.github.io/votre-repo


def get_due_reviews():
    resp = requests.get(APPS_SCRIPT_URL, params={"action": "due_reviews"}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def mark_notified(review_rows):
    if not review_rows:
        return
    requests.post(
        APPS_SCRIPT_URL,
        data=json.dumps({"action": "mark_notified", "review_rows": review_rows}),
        headers={"Content-Type": "text/plain"},  # évite le préflight CORS côté Apps Script
        timeout=30,
    )


def send_push(subscription, title, body, url):
    webpush(
        subscription_info=subscription,
        data=json.dumps({"title": title, "body": body, "url": url}),
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
    )


def main():
    data = get_due_reviews()
    reviews = data.get("reviews", [])
    subscriptions = data.get("subscriptions", [])

    if not reviews:
        print("Aucune révision due aujourd'hui.")
        return

    print(f"{len(reviews)} révision(s) due(s), {len(subscriptions)} abonné(s).")
    notified_rows = []

    for rev in reviews:
        # Redirige vers la page de détail où l'utilisateur répond maîtrisé / pas encore
        url = f"{GITHUB_PAGES_URL}/fiche.html?id={rev['fiche_id']}"
        title = f"📚 Révision J{rev['jour_j']} : {rev['titre']}"
        body = rev["matiere"] or "C'est le moment de réviser cette fiche."

        succes = False
        for sub in subscriptions:
            try:
                send_push(sub, title, body, url)
                succes = True
            except WebPushException as e:
                print(f"Échec d'envoi pour un abonné : {e}")

        if succes:
            notified_rows.append(rev["review_row"])

    mark_notified(notified_rows)
    print(f"{len(notified_rows)} révision(s) notifiée(s) avec succès.")


if __name__ == "__main__":
    main()
