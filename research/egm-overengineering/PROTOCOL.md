# EGM-Forschung: Protokoll vor Versuchsbeginn

Datum: 1. November 2026. Issue: `bb-elephant-goldfish-viw`.
Autorisierung: vollständig autonome Forschung mit einem Agenten als simuliertem
menschlichem Entscheider. Keine Produktionsänderung und keine reale menschliche
Freigabe werden daraus abgeleitet.

## Fragen und Hypothesen

1. Wie viel aktive Alternativensuche hilft, ohne eine Gegenarchitektur erzwingen
   zu müssen? Hypothese: kurze Prüfung von Weglassen, Begrenzen oder manueller
   Behandlung genügt häufig; formale Vollständigkeit kann Zusatzarbeit erzeugen.
2. Welche Form braucht eine Risikoentscheidung? Hypothese: konkrete Folgen und
   tragende Annahmen sind nötig, ein allgemeines Formular ist nicht nachgewiesen.
3. Wann muss Unsicherheit eskaliert werden? Hypothese: Wirkungskette, Schaden,
   Umkehrbarkeit und verfügbare Begrenzung sind brauchbarer als das bloße Fehlen
   eines Anforderungssatzes oder eine allgemeine Pflicht zur Reproduktion.

Der erste Vergleich prüft das gemeinsame Regelpaket. Er isoliert nicht die
kausale Wirkung jedes einzelnen Satzes. Gezielte Nachversuche prüfen die drei
Streitfragen separat anhand festgehaltener Zwischenstände.

## Isolation und Ausgangszustand

- Quelle: `/Users/marco/coding/infomaniak-ai-mail-gateway`, Commit
  `8f1e94084a6dbdb6ea5cc673805fffc7598dcf71`.
- Das Original enthält eine uncommittete Spec-Änderung. Sie wird weder verändert
  noch Teil der kontrollierten Versuchsbasis. Hashes und Status werden erfasst.
- Ein Klon ohne lokale Objektverknüpfung, Hardlinks oder verbleibendes Remote
  stellt die unabhängige Kopie bereit. Kein Git-Worktree mit gemeinsamem Index.
- Fälle erhalten eigene Projektkopien und Dokumentzustände. Keine Credentials,
  privaten Laufzeitdaten oder Produktionsverbindungen werden kopiert/benutzt.
- Große Artefakte bleiben unter `$BB_THREAD_STORAGE/egm-research-2026-11-01/`.

## Szenarien

| Fall | Aufgabe | Zu beobachtende Spannung |
|---|---|---|
| S1 | Hilfe zu `check-config` präzisieren; reine Dokumentationsänderung, keine Verhaltensänderung. | Proportionalität und unnötige Alternativen-/Betriebskosteninventur. |
| S2 | Nach Restore einen klaren Wiederanlauf beschreiben; Ausgangskandidat lässt unvollständige APPEND-Arbeit erneut zu. | Impliziter Schutzbedarf versus zusätzliche Verfügbarkeitsgarantie; begrenztere sichere Lösung. |
| S3 | Eine lokale Health-Probe für einen neuen automatischen Neustart-Consumer einordnen. | Bekannte Grenze unter geänderten Annahmen, Risikoentscheidung und Eskalation. |

Die Aufgaben verwenden gekürzte, belegte Ausschnitte der unabhängigen Kopie.
S2 enthält eine bewusst eingebrachte mangelhafte Ausgangsentscheidung. S3 nutzt
ein synthetisches neues Betreiberziel. Diese Szenarien sind keine Behauptung
über tatsächliche Wünsche oder Entscheidungen des Nutzers.

## Bedingungen und Rollen

**A:** Originale, aus `stageMessages` exportierte Goldfish-Prompts und Standards
der aktuellen BB-Adaption; Elephant-Auflösung nach der bestehenden Anleitung.

**B:** Dieselben Rollen, Kontextausschnitte, Aufgaben und Grenzen. Zusätzlich
ein kurzer gemeinsamer Vertrag aus der moderierten Diskussion; die widersprechende
Zero-Decision-Passage und die pauschale Alternativenpflicht werden gezielt ersetzt.
Keine persönlichen Skills, zusätzlichen Reviewer oder neuen Finding-Zustände.

Pro Szenario und Bedingung gibt es zunächst einen Durchlauf: sechs Zellen.
Keine statistische Wirksamkeitsaussage aus dieser kleinen gezielten Auswahl.
Reihenfolge und Verteilung der Bedingungen werden vor Start festgelegt.

Jede Rolle startet als eigener frischer BB-Worker mit geerbter Provider-/Modell-/
Reasoning-Auswahl. Goldfish sehen die Quellen und das Dokument, nicht die
Elephant-Unterhaltung oder die Bewertungen. Der Mensch-Proxy erhält für beide
Bedingungen dasselbe feste Präferenzprofil und keine Bedingungsbezeichnung.
Er darf Anforderungen nicht erfinden und darf Änderungen ablehnen.

## Simulierter Ablauf

1. Elephant erstellt aus Aufgabe, Quellen und Ausgangskandidat einen Entwurf.
2. Fünf Goldfish-Stufen entsprechend `full`: Zoom out, Comprehension, Design
   critic, zweites Zoom out mit bisherigen Berichten, Implementation readiness.
3. Elephant bewertet Findings und schlägt eine vollständige Revision vor.
4. Ein separater Mensch-Proxy entscheidet mit Begründung und verbleibenden Fragen.
   Bei Ablehnung ist höchstens eine gezielte Revision mit neuer Proxy-Entscheidung
   zulässig. Ablehnung wird nicht als Zustimmung behandelt.
5. Nur bei simulierter Zustimmung wird der Dokumentzustand fortgeschrieben.
   Eine zweite vollständige Fünfstufenprüfung prüft genau diese Revision.
6. Ein separater Mensch-Proxy fällt die abschließende Entscheidung. Offene
   Fragen bleiben offen; das Versuchslimit wird nicht zu erfolgreicher Prüfung.
7. Ein bedingungsblind beauftragter Evaluator prüft Zielerfüllung, Schutzwirkung,
   neue Pflichten, unnötigen Prozess und Entscheidungsunterstützung an konkreten
   Textstellen. Die geheimen Prüfkriterien werden vorher festgehalten.

Dokumentrevisionen entstehen während des Workflows als explizite unveränderliche
Textwerte. Die Entscheidung und der folgende Prüfgegenstand sind im vollständigen
Transkript gespeichert. Bestätigte Werte werden anschließend bytegenau in den
zugehörigen Projektkopien materialisiert, mit Pre-image und Hashnachweisen.
Das simuliert die Entscheidungs- und Revisionsschleife, nicht die reale BB-UI,
atomare Apply-Implementierung oder echte menschliche Freigaben.

## Messung und Gegenprüfungen

- Vollständige Prompts, Antworten, Rollen, Reihenfolge, Laufzeiten, Modell und
  etwaige Fehler speichern. Technische Wiederholungen getrennt kennzeichnen.
- Zeichen/Wörter pro Rolle, Dokumentwachstum, Fragen des Proxys, Zahl tatsächlicher
  Revisionen und explizite Zustimmungen erfassen. Dies sind Aufwandsproxies,
  keine gemessenen menschlichen Minuten oder verifizierten Tokenkosten.
- Evaluatorurteile mit Zitaten belegen; `uncertain` erlauben. Keine Belohnung
  für weniger Findings oder kürzere Dokumente ohne erhaltenen Nutzen/Schutz.
- Importpfad vor lokalen Tests kontrollieren. Ein ausgewählter Restore-Test
  dient als ausführbarer Beleg der Schutzanforderung, nicht als Beweis, dass
  eine erzeugte Spezifikation korrekt implementiert wurde.
- Versionsfolge, Genehmigung vor Zustandswechsel, unveränderte Quellbasis und
  exakte materialisierte Texte deterministisch prüfen.
- Die drei Streitfragen anschließend mit gezielten Gegenvarianten prüfen;
  auffällige Widersprüche oder unklare Bewertungen anhand der Rohdaten nachprüfen.

## Grenzen und Abschluss

Agenten als Nutzervertreter teilen Modellschwächen mit anderen Rollen. Die
Simulation misst weder menschliche Präferenzen noch reale Entscheidungslast.
Gekürzte Kontexte können Findings verändern; Kürzungen sind für A/B identisch
und werden gespeichert. Begrenzte Ausgaben und Runden können Ergebnisse zensieren;
entsprechende Fälle gelten nicht als sauber abgeschlossen.

Die Forschung ist abgeschlossen, wenn die Zellen und nötigen Nachversuche
ausgewertet, die drei Fragen mit Belegen und verbleibender Unsicherheit beantwortet
und sämtliche Artefakte auffindbar sind. Keine Plugin-Produktionsänderung wird
im Rahmen dieser Forschung umgesetzt oder freigegeben.

Methodische Orientierung: [Anthropic: Agent evals](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
zu getrennten Aufgaben, Durchläufen, Transkripten und Ergebnissen;
[Zheng et al.](https://arxiv.org/abs/2306.05685) zu Grenzen von Modellbewertern,
einschließlich Positions-, Längen- und Selbstbevorzugungsbias. Diese Quellen
belegen nicht die Wirksamkeit unserer konkreten Intervention.
