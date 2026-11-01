# Aufbau und Abweichungen

Diese Einträge dokumentieren technische Beobachtungen und Abweichungen;
sie ersetzen keine Auswertung der Versuchsbedingungen.

## Vor den inhaltlichen Ergebnissen

- Der leere Aufbau-Lauf `wfr_bccfd6dd-d447-4367-99f1-5fa40b85a858` enthielt
  null Agentenaufrufe. Ursache war eine überschriebene Zell-ID bei der
  Eingabeerzeugung. Fallzuordnung korrigiert und Assertions ergänzt. Der Lauf
  ist kein Versuchsergebnis und wird nicht still durch einen erfolgreichen ersetzt.
- Die primären gültigen Läufe heißen
  `wfr_5f9f88e2-8869-4b96-a9a7-7988785085a1` und
  `wfr_5b651787-885f-49ab-aeef-9b36d105b44a`.
- S1 enthält neben dem relevanten CLI-Code versehentlich einen README-Ausschnitt
  zu Telemetrie/Empfang statt des passenden `check-config`-Absatzes. Der Code
  belegt den frühen Return vor Credentials/Storage. Der zusätzliche Kontext ist
  in A/B gleich, kann aber unnötige Diskussion erzeugen. Die Hauptversuche werden
  nicht nachträglich geändert. Mikroversuche verwenden den passenden Ausschnitt;
  diese Kontextänderung wird nicht als kontrollierter Replikationseffekt ausgegeben.
- Der unabhängige Basisklon importiert sein eigenes Paket. Die drei vorhandenen
  Restore-Fälle bestehen lokal mit einer synthetischen Mailbox: 3 passed.
- Die erste Mutationsprüfung lieferte unerwartet ebenfalls 3 passed. Ein eigener
  Elternprozess-Importpfad genügte nicht: Der Backup-Helfer verwirft `PYTHONPATH`
  und lud über die wiederverwendete Umgebung das unveränderte Basispaket. Das
  Ergebnis ist als kontaminierter Aufbauversuch erhalten. Der korrigierte Versuch
  installiert die mutierte Kopie in ihrer eigenen Umgebung. Das ist ein Befund
  zur notwendigen Versuchsisolation, kein Beleg für Robustheit der Mutation.
- Der Syntaxvalidator wies die erste Fassung des Mikroversuchs-Workflows wegen
  einer fehlenden schließenden Klammer ab; es startete dafür kein Agent. Korrigiert
  und erneut validiert, bevor der Mikroversuch gestartet wurde.

## Aussagegrenzen der Simulation

- Verglichen werden rollentreue, begrenzte Dokumententscheidungen mit den aus
  der BB-Adaption exportierten Review-Prompts. Der gemeinsame Drafting-Auftrag
  ist bewusst kompakt und führt nicht den kompletten interaktiven Draft-Skill aus.
- Die simulierten Dokumentzustände werden in Workflow-Ergebnissen fortgeschrieben
  und nach den Zustimmungsprüfungen bytegenau materialisiert. Die reale EGM-UI,
  der reale Apply-Pfad und produktive Berechtigungen werden nicht aufgerufen.
- Toolfreie Reviewer werden als BB-Worker mit einer Ergebnis-Schnittstelle
  ausgeführt. Ein echter Advanced Endpoint wird nicht aufgerufen. Gemeinsame
  Prompt-Zusammenstellung ist kein experimenteller Nachweis identischer Engines.
- Alle Rollen erben dieselbe Modellauswahl. Rollen- und Kontexttrennung bedeutet
  keine Modellvielfalt oder menschliche Validierung. Kontext- und Ausgabelimits
  sind für A/B gleich und können dennoch Ergebnisse begrenzen.

## Diagnose nach dem Hauptvergleich

- Die Hauptsimulation übergibt dem Entscheider Dokument, Quellen, Findings und
  Autorenbegründung, aber nicht das separate `questions`-Array des Autors.
  Ein Teil der Fragen steht auch im Dokument; die formale Frageweitergabe ist
  dennoch unvollständig. Daraus lassen sich keine Aussagen über menschliche
  Entlastung oder die Vollständigkeit der Präferenzklärung ableiten.
- Sechs neue Entscheider beurteilen deshalb die unveränderten Enddokumente mit
  ausdrücklich übergebenen Autorenfragen erneut, ohne frühere Entscheidungen
  oder Bedingungsnamen zu sehen. Sie unterscheiden Präferenzentscheidungen von
  technischen Nachschlagefragen. Diese nachträgliche Diagnose korrigiert die
  ursprünglichen Transkripte nicht und ist keine A/B-Replikation.

## Abschlussdiagnostik

- Die unabhängige Methodenprüfung beanstandete insbesondere ungleichen Zielumfang
  bei S2, uneinheitliche Modellnoten und unvollständige Frage-/Bedingungsübergabe.
  `uniform-adjudication.json` ordnet alle Zellen neu ein; ursprüngliche Urteile
  und Transkripte bleiben unverändert.
- `flow_checks.mjs` führt die tatsächliche Workflow-Quelle mit festen Antworten
  aus. Es bestätigt den Verlust ausschließlich separat gespeicherter Fragen und
  den Textwechsel bei `approve` trotz ausdrücklich unerfüllter Vorbedingung.
  Ablehnung und weiterhin verlangte Revision erhalten den Ausgangstext. Eine
  transiente Frageweitergabe wird nur diagnostisch getestet, nicht rückwirkend
  zum Bestandteil der Hauptversuche erklärt.
- Die eigentlichen Modellläufe prüften den Korrekturzweig nicht: Alle sechs
  ersten Bestätigungen waren `approve`. Die zweite Runde wurde auch bei leeren
  Berichten erzwungen und entspricht damit keiner nativen Abbruchregel.
- Der kontrollierte Restore-Vergleich nutzt in Baseline und Mutation denselben
  angepassten Test. Baseline: 3 passed; Mutation: 2 failed, 1 passed. Je sechs
  tatsächliche Kindprozessimporte verweisen auf die richtige Kopie/Umgebung;
  die Testhashes sind identisch. Der kontaminierte Vorversuch bleibt ausgeschlossen.
- Die Ereignisprüfung umfasst 122 erfolgreiche Agentenaufrufe. Alle nutzten
  ausschließlich `bb_workflow_result`; 117 enthalten numerische Nutzungsdaten,
  fünf nicht. Fehlende Werte werden nicht geschätzt. Alle 60 Reviewberichte
  sind nativ parsebar; der längste hat 391 Wörter bei angefragten maximal 500.
- Die Vergleichsbedingung A verwendet exportierte Review-Prompts, aber kompakte
  gemeinsame Draft-/Resolver-Aufträge statt der vollständigen interaktiven
  Elephant-Anleitung. Die stärkere Originaltreue im Vorabprotokoll wurde damit
  nicht vollständig erreicht; die Auswertung verwendet die engere Bezeichnung.
- Beim abschließenden Originalvergleich war HEAD bereits von `8f1e940` auf
  `34fa0cf` fortgeschrieben. Zwei getrackte Quelldateien unterscheiden sich;
  der Status wechselte von einer uncommitteten Spec-Änderung zu sauber. Das
  Original wurde durch unsere Forschung nur gelesen. Die Studie stützt sich auf
  die unabhängige eingefrorene Kopie, nicht auf einen behaupteten unveränderten
  Endzustand des anderweitig weiterbearbeiteten Originals.
