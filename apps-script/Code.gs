/**
 * Backend "méthode des J" — Google Apps Script.
 * Avec système de maîtrise : si maîtrisé, les révisions restantes sont
 * annulées ; si non maîtrisé, le planning initial continue normalement.
 */

const INTERVALLES_J = [1, 3, 7, 15, 30, 60, 90];

function getSheet(nom, entetes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nom);
  if (!sheet) {
    sheet = ss.insertSheet(nom);
    sheet.appendRow(entetes);
  }
  return sheet;
}

function sheetFiches() {
  return getSheet("Fiches", ["id", "titre", "matiere", "url", "contenu", "date_creation", "statut"]);
}
function sheetReviews() {
  return getSheet("Reviews", ["id", "fiche_id", "jour_j", "date_prevue", "effectuee", "notifiee", "resultat"]);
}
function sheetSubscriptions() {
  return getSheet("Subscriptions", ["endpoint", "subscription_json"]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function todayISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}
function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

// --- Création d'une fiche + planning automatique -----------------------

function creerFiche(data) {
  const fichesSheet = sheetFiches();
  const reviewsSheet = sheetReviews();

  const ficheId = fichesSheet.getLastRow();
  fichesSheet.appendRow([
    ficheId, data.titre, data.matiere || "Sans matière", data.url || "", data.contenu || "",
    todayISO(), "en_cours"
  ]);

  INTERVALLES_J.forEach(j => {
    const reviewId = Utilities.getUuid();
    reviewsSheet.appendRow([reviewId, ficheId, j, addDaysISO(j), false, false, ""]);
  });

  return { id: ficheId, status: "ok" };
}

// --- Liste des fiches, groupables par matière côté frontend --------------

function listerFiches() {
  const fichesData = sheetFiches().getDataRange().getValues();
  const reviewsData = sheetReviews().getDataRange().getValues();
  const fichesHeader = fichesData.shift();
  const reviewsHeader = reviewsData.shift();
  const idx = (header, name) => header.indexOf(name);

  const result = fichesData.map(row => {
    const ficheId = row[idx(fichesHeader, "id")];
    const revisionsFiche = reviewsData
      .filter(r => r[idx(reviewsHeader, "fiche_id")] === ficheId && !r[idx(reviewsHeader, "effectuee")])
      .sort((a, b) => new Date(a[idx(reviewsHeader, "date_prevue")]) - new Date(b[idx(reviewsHeader, "date_prevue")]));
    const prochaine = revisionsFiche[0];

    return {
      id: ficheId,
      titre: row[idx(fichesHeader, "titre")],
      matiere: row[idx(fichesHeader, "matiere")] || "Sans matière",
      url: row[idx(fichesHeader, "url")],
      date_creation: row[idx(fichesHeader, "date_creation")],
      statut: row[idx(fichesHeader, "statut")] || "en_cours",
      prochaine_revision: prochaine ? prochaine[idx(reviewsHeader, "date_prevue")] : null,
      jour_j: prochaine ? prochaine[idx(reviewsHeader, "jour_j")] : null,
    };
  });

  return result.reverse();
}

// --- Détail d'une fiche : historique + révision active à répondre -------

function ficheDetail(ficheId) {
  const fichesData = sheetFiches().getDataRange().getValues();
  const fichesHeader = fichesData.shift();
  const idxF = (name) => fichesHeader.indexOf(name);
  const ficheRow = fichesData.find(f => f[idxF("id")] === ficheId);
  if (!ficheRow) return { error: "Fiche introuvable" };

  const reviewsData = sheetReviews().getDataRange().getValues();
  const reviewsHeader = reviewsData.shift();
  const idxR = (name) => reviewsHeader.indexOf(name);

  const revisions = reviewsData
    .filter(r => r[idxR("fiche_id")] === ficheId)
    .sort((a, b) => new Date(a[idxR("date_prevue")]) - new Date(b[idxR("date_prevue")]))
    .map(r => ({
      id: r[idxR("id")],
      jour_j: r[idxR("jour_j")],
      date_prevue: r[idxR("date_prevue")],
      effectuee: r[idxR("effectuee")],
      notifiee: r[idxR("notifiee")],
      resultat: r[idxR("resultat")],
    }));

  const today = todayISO();
  // révision "active" = due aujourd'hui (ou avant) et pas encore répondue
  const revisionActive = revisions.find(r => !r.effectuee && r.date_prevue <= today) || null;

  return {
    fiche: {
      id: ficheRow[idxF("id")],
      titre: ficheRow[idxF("titre")],
      matiere: ficheRow[idxF("matiere")],
      url: ficheRow[idxF("url")],
      contenu: ficheRow[idxF("contenu")],
      statut: ficheRow[idxF("statut")],
    },
    revisions,
    revision_active: revisionActive,
  };
}

// --- Répondre à une révision : maîtrisé ou pas ---------------------------

function marquerRevision(ficheId, reviewId, resultat) {
  const sheet = sheetReviews();
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const idxId = header.indexOf("id");
  const idxFicheId = header.indexOf("fiche_id");
  const idxEffectuee = header.indexOf("effectuee");
  const idxResultat = header.indexOf("resultat");

  for (let i = 1; i < data.length; i++) {
    if (data[i][idxId] === reviewId) {
      sheet.getRange(i + 1, idxEffectuee + 1).setValue(true);
      sheet.getRange(i + 1, idxResultat + 1).setValue(resultat);
      break;
    }
  }

  if (resultat === "maitrise") {
    // Annule toutes les révisions futures restantes pour cette fiche
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxFicheId] === ficheId && !data[i][idxEffectuee]) {
        sheet.getRange(i + 1, idxEffectuee + 1).setValue(true);
        sheet.getRange(i + 1, idxResultat + 1).setValue("annulee");
      }
    }
    const fichesSheet = sheetFiches();
    const fichesData = fichesSheet.getDataRange().getValues();
    const fHeader = fichesData[0];
    const idxFId = fHeader.indexOf("id");
    const idxStatut = fHeader.indexOf("statut");
    for (let i = 1; i < fichesData.length; i++) {
      if (fichesData[i][idxFId] === ficheId) {
        fichesSheet.getRange(i + 1, idxStatut + 1).setValue("maitrisee");
        break;
      }
    }
  }
  // Si "non_maitrise" : rien à faire de plus, le planning initial (J suivant) continue tel quel

  return { status: "ok" };
}

// --- Abonnement aux notifications push -----------------------------------

function ajouterAbonnement(subscription) {
  const sheet = sheetSubscriptions();
  const data = sheet.getDataRange().getValues();
  const dejaPresent = data.some(row => row[0] === subscription.endpoint);
  if (!dejaPresent) sheet.appendRow([subscription.endpoint, JSON.stringify(subscription)]);
  return { status: "ok" };
}

// --- Révisions dues, appelé par le script Python (GitHub Actions) -------

function revisionsDuesEtAbonnements() {
  const reviewsData = sheetReviews().getDataRange().getValues();
  const reviewsHeader = reviewsData.shift();
  const fichesData = sheetFiches().getDataRange().getValues();
  const fichesHeader = fichesData.shift();
  const subsData = sheetSubscriptions().getDataRange().getValues();
  subsData.shift();

  const idxR = (name) => reviewsHeader.indexOf(name);
  const idxF = (name) => fichesHeader.indexOf(name);
  const today = todayISO();

  const dues = reviewsData
    .map((row, i) => ({ row, rowIndex: i + 2 }))
    .filter(({ row }) => row[idxR("date_prevue")] <= today && !row[idxR("notifiee")] && !row[idxR("effectuee")])
    .map(({ row, rowIndex }) => {
      const fiche = fichesData.find(f => f[idxF("id")] === row[idxR("fiche_id")]);
      return {
        review_row: rowIndex,
        review_id: row[idxR("id")],
        jour_j: row[idxR("jour_j")],
        titre: fiche ? fiche[idxF("titre")] : "Fiche",
        matiere: fiche ? fiche[idxF("matiere")] : "",
        fiche_id: row[idxR("fiche_id")],
      };
    });

  const subscriptions = subsData.map(row => JSON.parse(row[1]));
  return { reviews: dues, subscriptions };
}

function marquerNotifiees(reviewRows) {
  const sheet = sheetReviews();
  reviewRows.forEach(rowIndex => sheet.getRange(rowIndex, 6).setValue(true));
  return { status: "ok" };
}

// --- Toutes les révisions, pour affichage calendrier ---------------------

function toutesRevisions() {
  const reviewsData = sheetReviews().getDataRange().getValues();
  const reviewsHeader = reviewsData.shift();
  const fichesData = sheetFiches().getDataRange().getValues();
  const fichesHeader = fichesData.shift();
  const idxR = (name) => reviewsHeader.indexOf(name);
  const idxF = (name) => fichesHeader.indexOf(name);

  return reviewsData.map(row => {
    const fiche = fichesData.find(f => f[idxF("id")] === row[idxR("fiche_id")]);
    return {
      date_prevue: row[idxR("date_prevue")],
      fiche_id: row[idxR("fiche_id")],
      titre: fiche ? fiche[idxF("titre")] : "Fiche",
      matiere: fiche ? fiche[idxF("matiere")] : "",
      jour_j: row[idxR("jour_j")],
      effectuee: row[idxR("effectuee")],
      resultat: row[idxR("resultat")],
    };
  });
}

// --- Points d'entrée HTTP -------------------------------------------------

function doGet(e) {
  const action = e.parameter.action;
  if (action === "list_fiches") return jsonResponse(listerFiches());
  if (action === "due_reviews") return jsonResponse(revisionsDuesEtAbonnements());
  if (action === "fiche_detail") return jsonResponse(ficheDetail(Number(e.parameter.id)));
  if (action === "all_revisions") return jsonResponse(toutesRevisions());
  return jsonResponse({ error: "action inconnue" });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.action === "create_fiche") return jsonResponse(creerFiche(body));
  if (body.action === "subscribe") return jsonResponse(ajouterAbonnement(body.subscription));
  if (body.action === "mark_notified") return jsonResponse(marquerNotifiees(body.review_rows));
  if (body.action === "mark_review") return jsonResponse(marquerRevision(body.fiche_id, body.review_id, body.resultat));
  return jsonResponse({ error: "action inconnue" });
}
