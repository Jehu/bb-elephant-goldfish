# EGM und Overengineering: Ergebnisse der autonomen Forschung

1. November 2026 · Issue `bb-elephant-goldfish-viw` · abgeschlossene, begrenzte Simulation.

Die Untersuchung liefert konkrete Gegenbeispiele und brauchbare Präzisierungen.
Sie belegt **keine allgemeine Überlegenheit des vorgeschlagenen Regelpakets**.
Die stärkste Erkenntnis ist eine gefährliche Begründungslücke: Ein fehlendes
ausdrückliches Verbot wurde als Zustimmung zu einem bereits erkannten
Wiederholungsrisiko behandelt. Eine konkrete Schadenskette genügte der anderen
Promptvariante, um eine begrenzte Pause vorzuschlagen, ohne neue Infrastruktur
oder eine umfassende Zustellgarantie zu verlangen.

Für die Alternativensuche und die Form von Risikoentscheidungen unterscheiden
sich die beobachteten Entscheidungen dagegen nicht. Eine allgemeine Formular-
oder Alternativenpflicht lässt sich damit ebenso wenig begründen wie deren
generelle Nutzlosigkeit.

## Untersuchungsgrundlage und Umfang

Das Gateway wurde unabhängig geklont: keine Hardlinks, kein gemeinsamer Index,
keine Git-Alternates und kein verbleibendes Remote. Versuchsbasis ist Commit
`8f1e94084a6dbdb6ea5cc673805fffc7598dcf71`; die damals uncommittete
Designänderung blieb ausgeschlossen. Jede Hauptzelle erhielt eine eigene
Projektkopie. Es gab keine produktiven Mailverbindungen, Credentials oder
Eingriffe in reale EGM-Entscheidungen. Veränderte Gateway-Dateien und Tests
befinden sich ausschließlich in Versuchskopien.

Das Original wurde während der Studie anderweitig fortgeschrieben: Die letzte
Beobachtung zeigt HEAD `34fa0cf75b5703d1df044a5aa7d36ffbbfdc75b0`, einen sauberen
Status und gegenüber der ersten Beobachtung geänderte Bytes in
`src/mailgw/maintenance.py` und `tests/test_maintenance.py`. Unsere Arbeit am
Original war lesend. Ein bytegleiches Original am Studienende ist deshalb
**kein** vorliegender Nachweis; die eingefrorene Versuchsbasis blieb davon
unabhängig. Die Beobachtungen stehen in
[source-verification.json](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/source-verification.json).

Durchgeführt wurden sechs vollständige Dokument-Simulationen, zwanzig kurze
Entscheidungsproben, sechs zusätzliche Entscheidungen zur Fragenweitergabe und
eine Methodenprüfung: insgesamt **122 erfolgreiche Agentenaufrufe**. Hinzu
kommen deterministische Ablaufprüfungen und synthetische Gateway-Tests.
Der leere Aufbau-Lauf mit null Agentenaufrufen bleibt ausgeschlossen.

Alle Rollen verwendeten `codex / gpt-6.1-sol / high` mit frischem Rollenkontext.
Getrennte Rollen bedeuten daher keine unabhängigen Modellfamilien. Der Agent
in der Menschenrolle erhielt ein festes Betreiberprofil. Seine Zustimmungen
gelten ausschließlich für den Versuch und sind keine menschlichen Präferenzen,
Risikoannahmen oder Betriebsfreigaben.

## Was tatsächlich verglichen wurde

**A** verwendet die fünf aus der BB-Adaption exportierten Goldfish-Systemprompts.
**B** verwendet diese Grundlage mit den eingefrorenen Präzisierungen zur
Verhältnismäßigkeit, Alternativensuche und Grenze vorab zu entscheidender Fragen.
Quellen, Aufgaben und Betreiberprofile sind innerhalb jedes Paars gleich.

Die Elephant-Aufträge sind kompakte gemeinsame Forschungsaufträge. Damit wurde
die Vorabprotokoll-Formulierung „nach der bestehenden Anleitung“ nur teilweise
eingelöst: Der komplette interaktive Elephant-Skill wurde nicht ausgeführt.
A ist eine Simulation mit exportierten Review-Prompts, keine originalgetreue
Reproduktion sämtlicher nativer EGM-Abläufe. Persönliche Skills gehören weder
zur Intervention noch zu den Voraussetzungen der daraus abgeleiteten Vorschläge.

Jede Zelle durchlief Entwurf, fünf frische Goldfish-Stufen, Auflösung,
simulierte Bestätigung, erneute fünfstufige Prüfung und Abschlussentscheidung.
Die zweite Runde war zur Vergleichbarkeit fest vorgeschrieben, auch bei
unverändertem Dokument oder leerer erster Reviewrunde. Das weicht von einem
nativen Abbruch bei sauberem Ergebnis ab. Nur das zweite Zoom-out erhielt
frühere Berichte derselben Runde. Die produktive UI und der reale Apply-Pfad
wurden nicht benutzt; bestätigte Textwerte wurden anschließend bytegenau mit
Pre-image und Hash in den Fallkopien materialisiert.

Tatsächliche Prompts, B-Ersetzungen, Profile, Prüfkriterien, Reihenfolge und
Worker-Metadaten sind archiviert; [ARCHIVE.json](ARCHIVE.json) erschließt sie.
Die ersten drei Fälle liefen in der Reihenfolge `01, 04, 05`, danach `02, 03, 06`.
Die Auswahl ist gezielt und klein, ohne randomisierte Replikation pro Hauptzelle.

## Hauptvergleich: Dokumente und Entscheidungen

Wörter und Findings sind beschreibende Größen. Ein Finding kann nötig sein;
ein kürzeres Dokument kann einen kleineren Leistungsumfang anbieten.

| Zelle | Fall / Bedingung | Wörter Entwurf → Revision | Findings Runde 1 → 2 | Letzte simulierte Dokumententscheidung |
|---|---|---:|---:|---|
| 01 | S1 Hilfetext / A | 309 → 367 | 1 → 0 | angenommen, Umsetzung und Prüfung offen |
| 02 | S1 Hilfetext / B | 337 → 337 | 0 → 1 | angenommen, Quellprüfung und Umsetzung offen |
| 03 | S2 Wiederanlauf / A | 769 → 2342 | 11 → 10 | Revision verlangt; am Rundenlimit ungelöst |
| 04 | S2 Wiederanlauf / B | 686 → 1188 | 6 → 2 | ausdrücklich auf gesperrte Triage begrenzt angenommen |
| 05 | S3 Probe/Neustart / A | 575 → 785 | 1 → 0 | manuelle Diagnose empfohlen; Automatik nicht angenommen |
| 06 | S3 Probe/Neustart / B | 817 → 822 | 0 → 0 | manuelle Diagnose empfohlen; Automatik nicht angenommen |

Alle sechs ersten Bestätigungen waren `approve`; der vorgesehene
Korrekturzweig wurde von den Modellen nicht benutzt. Fünf letzte Zustimmungen
sind fünf Dokumententscheidungen, keine fünf implementierten Sachaufgaben.
Keine Zelle implementierte die vorgeschlagenen Gateway-Änderungen oder erteilte
eine operative Freigabe.

**S1:** A erzeugte das zusätzliche Finding „Required alternatives rationale is
missing“ und einen zusätzlichen Begründungsabsatz zur Gestaltung der CLI-Hilfe.
Damit ist lokale Mehrarbeit beobachtet. Ihre Nutzlosigkeit ist nicht belegt:
Resolver und Modellbewerter hielten die Erläuterung für nützlich beziehungsweise
angemessen. Bei B fand eine neue Runde im bytegleichen Dokument erstmals eine
offene Quellfrage. Neue Findings beweisen hier keine Regression durch eine
Dokumentänderung.

Beiden Kontexten fehlte die Implementierung von `load_settings`. Der sichtbare
Dispatcher kehrt vor Storage, Credentials und Verbindungsaufbau zurück, ruft
aber vorher diese Funktion auf. Aussagen über das Gesamtkommando erfordern
deren technische Prüfung. Die ursprünglichen Modellbewertungen behandelten
diese Lücke uneinheitlich (`yes` für A, `uncertain` für B). Die einheitliche
Auswertung weist bei beiden Prüfung und Umsetzung als offen aus. Außerdem
enthielt S1 versehentlich einen zusätzlichen unpassenden README-Ausschnitt;
dieser war in A und B identisch und bleibt als Aufbaufehler dokumentiert.

**S2:** A entwickelte einen Vertrag für das Freigeben der globalen Recovery-Sperre
mit Inspektion, Bestätigung und Transaktionssemantik. Am Ende blieb insbesondere
die Behauptung eines Rollbacks trotz möglicherweise bereits bestätigter
Transaktion widersprüchlich. B beschränkte sich auf Inspektion und Triage bei
weiter gesperrtem Betrieb. Der Proxy akzeptierte diese Einschränkung ausdrücklich.
Das ist ein möglicher sicherer Zwischenstand, erfüllt aber keinen vollständigen
Wiederanlauf. Der Vergleich belegt deshalb weder bessere Zielerfüllung noch
geringere Kosten für eine gleichwertige Lösung durch B. Ob die zusätzlichen
Schnittstellen von A benötigt werden, hängt vom tatsächlich gewählten
Wiederanlaufumfang ab.

**S3:** Beide Bedingungen empfahlen manuelle Diagnose statt automatischer
Neustarts nach mehrdeutigen Probe-Fehlern. Die frühere Bestätigung einer
Transportgrenze wurde nicht zur Freigabe eines neuen Neustart-Consumers erklärt.
Für beide bleiben ein ausführbarer Health-Check-Vertrag und ein etablierter
Neustartablauf vor Ausführung nachzuweisen. B ist in diesem Fall länger als A.

Die korrigierte Einordnung einschließlich Bedingungen je Zelle steht in
[uniform-adjudication.json](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/uniform-adjudication.json).
Die früheren Modellurteile bleiben unverändert erhalten. Sie sind Bewertungen,
keine unabhängigen Nachweise für „kein unnötiger Prozess“ oder Sicherheit.

## Antworten auf die drei Streitfragen

### 1. Wie viel aktive Alternativensuche?

Eine kurze aktive Prüfung von Weglassen, Begrenzen und manueller Behandlung
ist als Arbeitsregel plausibel. Ein allgemeiner Zwang, für jede Änderung eine
Gegenarchitektur auszuarbeiten, ist durch diese Untersuchung nicht begründet.

In den vier gezielten Alternativenentscheidungen stimmten die Ergebnisse
überein: Beide Varianten bestätigten die kleine Dokumentationsänderung und
verlangten eine Revision der unsicheren Wiederanlaufidee. Die aktive Suche
lieferte hier keine zusätzliche andere Entscheidung. Der Zusatzabsatz in S1-A
zeigt Aufwand, beweist aber keinen Schaden durch die formale Pflicht.

**Vorschlag zur Erprobung:** Bei wesentlichen Umfangsentscheidungen kurz prüfen,
ob eine konkrete einfachere Lösung den vereinbarten Ablauf erfüllt. Nur eine
entscheidungserhebliche Alternative erläutern und eine begründete Empfehlung
geben. Kleine Änderungen benötigen keine eigene Alternativeninventur. Diese
Regel ist eine begründete Hypothese, kein gemessenes Optimum.

### 2. Welche Form braucht eine Risikoentscheidung?

In den zwei geprüften Kontexten führte freie Begründung zur gleichen Disposition
wie die vierteilige Struktur: dokumentierte Grenze bestätigen; neue pauschale
Neustartautomatik überarbeiten. Die Struktur machte im zweiten Kontext zwei
Betreiberfragen expliziter. Daraus folgt weder ein nachgewiesener Sicherheits-
oder Verständlichkeitsgewinn noch geringere menschliche Entscheidungslast.

**Vorschlag zur Erprobung:** Die Entscheidung muss erkennen lassen, wofür sie
gilt, welche Folgen verbleiben, welche Annahmen sie tragen und welche Handlung
die Zustimmung erlaubt. Das kann in wenigen Sätzen stehen. Szenario, Einsatz,
Folgen und Annahmen sind eine optionale Denkhilfe. Dokumentbestätigung,
Risikoakzeptanz und Betriebsfreigabe dürfen nicht auseinander abgeleitet werden.
Neue Nutzung oder widerlegte Annahmen erlauben erneute Prüfung; unveränderte
gültige Entscheidungen müssen nicht wiederholt eingeholt werden.

### 3. Wann muss Unsicherheit eskaliert werden?

Ein nachvollziehbarer, durch die vorliegenden Fakten gestützter Schadensweg
kann eine begrenzte Pause oder ausdrückliche Entscheidung rechtfertigen, auch
ohne Reproduktionslog und ausgeschriebenes Schutzgebot. Die technische Lösung
bleibt offen; eine neue umfassende Garantie folgt daraus nicht.

Die ersten zwei Unsicherheitspaare zeigten keinen Unterschied: Beide Varianten
akzeptierten den Hilfetext und schützten die bereits ausdrücklich abgesicherte
Restore-Grenze. Deshalb folgte ein synthetischer Stressfall ohne solche
ausgeschriebene Schutzregel:

1. T0: Das Backup enthält eine ausstehende Sent-Kopie.
2. T1: APPEND legt diese Kopie auf dem Server ab.
3. T2: Restore von T0 macht dieselbe Arbeit wieder automatisch ausführbar;
   die Serverkopie von T1 bleibt erhalten.

Eine Prüfsumme bestätigt den Snapshot, nicht den aktuellen Zustand des Servers.
Die künstliche `proof_gate`-Anweisung erlaubte Eskalation nur bei ausdrücklicher
Anforderung oder ausführbarer Reproduktion. Sie bestätigte in drei frischen
Versuchen die automatische Wiederholung, obwohl jede Begründung den Replay-Pfad
erkannte. Die `harm_chain`-Variante verlangte dreimal eine Restore-spezifische
Pause mit manueller Klärung. Zwei kosmetische Kontrollentscheidungen bestätigten
die reine Überschriftenänderung und verwarfen unbegründete Forderungen nach
Monitor und Fragebogen.

Die beanstandete Zustimmung ist nicht allein deshalb problematisch, weil ein
Modellbewerter sie „unsafe“ nannte. Ihre eigene Begründung erkannte den möglichen
zweiten APPEND; das Betreiberprofil erlaubte manuellen Stillstand und enthielt
keine ausdrückliche Annahme dieses Wiederholungsrisikos. Das fehlende Verbot wurde
als Erlaubnis behandelt. Eine dokumentierte Folge allein ersetzt diese Entscheidung
nicht. Das ist die belegte Begründungslücke.

Diese drei Wiederholungen schätzen **keine Fehlerquote von EGM**. Die Anweisung
war absichtlich streng, wirkte direkt auf den simulierten Entscheider und änderte
mehrere Aspekte zugleich. Die Gegenprobe isoliert keine einzelne Formulierung.
Auch die vorgeschlagene manuelle Auflösung ist noch kein validierter Reparaturpfad:
Eine erfolglose Suche beweist nicht, dass erneutes APPEND sicher wäre.

**Vorschlag zur Erprobung:** Konkrete Wirkungskette, mögliche Folgen und tragende
Annahmen benennen. Danach die kleinste tragfähige Klärung oder Begrenzung wählen.
Bloß vorstellbare Probleme ohne gestützten Schadensweg begründen keine neue
Infrastruktur. Technische Wissenslücken gehören zur Quellprüfung; echte
Nutzungs- und Risikoentscheidungen zum Menschen. Eine allgemeine numerische
Eskalationsschwelle wurde nicht ermittelt.

## Ausführbarer Gegenversuch am Gateway

Der vorhandene Restore-Test wurde zuerst unverändert in der unabhängigen
Basiskopie ausgeführt: drei synthetische Mailboxfälle bestanden. Anschließend
wurde in einer separaten Mutation die Restore-Klassifikation unvollständiger
Sent-Kopien deaktiviert. Für den Vergleich wurden nur zwei Assertions über
interne Zustandsbezeichnungen entfernt; die Verhaltensprüfung zur Zahl der
APPENDs blieb erhalten. Baseline und Mutation erhielten denselben angepassten
Test und dieselbe Importinstrumentierung.

| Vergleich unter gleichem Testaufbau | Ergebnis |
|---|---|
| Baseline mit Restore-Klassifikation | 3 bestanden |
| Mutation ohne diese Klassifikation | 2 fehlgeschlagen, 1 bestanden |

Die beiden Fehler zeigen jeweils zwei APPENDs. Die sichtbare bereits vorhandene
Kopie konnte im dritten Fall weiterhin abgeglichen werden. Separate Umgebungen
und je sechs aufgezeichnete tatsächliche Backup-Helferimporte belegen, dass auch
die Unterprozesse die jeweilige Kopie nutzten. Testhashes sind identisch;
Quellhashes und Importpfade stehen in
[restore-controlled-comparison.json](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/restore-controlled-comparison.json).

Ein erhaltener Vorversuch war kontaminiert: Der Unterprozess verwarf
`PYTHONPATH` und importierte über die wiederverwendete Umgebung das Basispaket.
Seine drei bestandenen Tests sind kein Gegenbeleg zur Mutation. Dieser Fehler
zeigt, warum die tatsächlichen Kindprozessimporte geprüft werden mussten.

Der kontrollierte Versuch belegt Schutzwirkung im synthetischen Mailboxmodell.
Er validiert keinen realen Provider, keine vollständige Wiederanlaufprozedur und
keine Implementierung der von den Agenten erzeugten Spezifikationen.

## Was für belastbaren Wissensgewinn nötig war

Die Methodenprüfung und die folgenden Diagnosen begrenzen die Interpretation
der Hauptversuche. Sie wurden nicht durch stilles Ersetzen der Rohdaten repariert.

**Fragen müssen den nächsten Entscheider erreichen.** Das separate
`questions`-Feld von Entwurf und Auflösung wurde im Forschungsablauf nicht
vollständig weitergereicht; einzelne Fragen standen zusätzlich im Dokument.
Null Rückfragen des Proxys sind deshalb kein Nachweis geklärter Unsicherheit
oder menschlicher Entlastung. In einer Diagnose erhielten sechs frische Proxys
die unveränderten Enddokumente mit allen zwanzig Autorenfragen. Die letzten
Dispositionen blieben gleich. Die Antworten ordneten fünf Fragen dem Betreiber,
dreizehn technischer Recherche und zwei beiden Bereichen zu. Das ist eine
nachträgliche Zuordnung durch Agenten, keine kontrollierte Wiederholung des
gesamten Vergleichs. Es macht aber sichtbar, wie leicht Implementierungsfragen
unnötig beim Menschen landen.

**Zustimmung braucht einen Gegenstand und einen Zeitpunkt.** Der Ablauf schrieb
bei `decision === approve` den Text fort; natürlichsprachliche Bedingungen wurden
gespeichert, aber nicht auf Erfüllung geprüft. Der abschließende Proxy bekam
vorherige Bedingungen nicht ausdrücklich vollständig übergeben. Die Unterscheidung
zwischen Dokumentzustimmung und späteren Umsetzungsvoraussetzungen war damit
nicht technisch abgesichert. Insbesondere S1-B verlangt Quellprüfung vor Anwendung
der operatorseitigen Formulierung. Der Vorschlag kann als Plan bestätigt sein,
seine Aussagen sind dadurch noch nicht geprüft oder zur operativen Nutzung
freigegeben.

Die deterministische Diagnose führte die tatsächliche Workflow-Quelle mit
festen Agentenantworten aus: Eine ausschließlich im Fragenfeld enthaltene Frage
ging verloren; `approve` mit ausdrücklich unerfüllter Vorbedingung führte trotzdem
zum Textwechsel. Ablehnung sowie nach einer Korrektur weiterhin verlangte Revision
erhielten den Ausgangszustand. Eine nur für die Diagnose eingefügte Fragenweitergabe
erreichte den Empfänger. Diese Checks belegen Grenzen des Forschungsablaufs,
keinen untersuchten Defekt im produktiven Plugin. Die ursprünglichen Trials
bleiben eingeschränkt auswertbar.

**Gleicher Zielumfang muss getrennt von sicherem Stillstand bewertet werden.**
Deshalb wurden alle sechs Zellen erneut nach Dokumententscheidung, akzeptiertem
Umfang, offenen Voraussetzungen, Implementierung und operativer Autorität
eingeordnet. Frühere uneinheitliche Modellnoten wurden nicht als Erfolgszahlen
übernommen. Besonders Triage und Wiederanlauf sind unterschiedliche Ergebnisse.

**Ausführbare Belege brauchen tatsächliche Isolation.** Der kontaminierte
Mutationsversuch wäre ohne Importnachweise leicht als positives Testergebnis
missverstanden worden. Elternprozess und Kindprozesse müssen zur gleichen
Versuchskopie gehören. Dieselben Verhaltensprüfungen müssen beide Varianten testen.

**Modellurteile und Aufwand benötigen Zurückhaltung.** Bedingungsnamen waren für
Bewertende verborgen; der Inhalt konnte die Intervention dennoch verraten.
Gleiche Modelle können denselben Fehler teilen. Wörter, Zeichen und aufsummierte
Aufrufzeiten sind Proxies, keine menschlichen Minuten oder vergleichbaren Kosten
pro gleichwertigem Ergebnis. Die Untersuchung misst keine menschliche Präferenz,
Verständlichkeit oder Belastung. Eine vollständige weitere Plattform ist dafür
noch nicht nötig; ein kleinerer sauber übergebener Vergleich wäre aussagekräftiger
als viele weitere Durchläufe dieses Ablaufs.

Alle sechzig Goldfish-Berichte konnten vom tatsächlichen Finding-Parser gelesen
werden, ohne unbekannte Schweregrade. Das ist ein Formatnachweis, kein Beleg
vollständiger Fehlererkennung. Die Ereignisprüfung erfasst Werkzeugnamen und
numerische Nutzung; private Reasoning-Inhalte wurden nicht als Forschungsdaten
übernommen. Alle 122 Aufrufe verwendeten ausschließlich die Ergebnis-Schnittstelle.
117 Aufrufe enthalten numerische Nutzungsdaten, fünf nicht; fehlende Werte
wurden nicht geschätzt. Kein Aufruf wurde aus einem früheren Lauf wiedergegeben.

## Konsequenz für die weitere EGM-Diskussion

Als nächster Entwurf erscheinen wenige gemeinsame Regeln vertretbar:
entscheidungserhebliche Alternativen kurz prüfen; impliziten Schutzbedarf anhand
einer konkreten Wirkungskette begründen; technische Recherche vom Nutzerurteil
trennen; Entscheidungen samt Annahmen und Reichweite weitergeben; akzeptierte
Umfangsreduktion offen ausweisen. Neue Garantien benötigen eine begründete
Empfehlung mit sichtbaren Folgekosten. Unveränderte Bereiche brauchen keine
Negativnachweise und kleine Änderungen kein eigenes Prozessdokument.

Diese Inhalte können im Plugin selbst formuliert werden und setzen keine
persönlichen Skills voraus. Sie sind hier **Forschungsergebnis und Vorschlag**,
keine beschlossene Produktänderung. Das bestehende Leitplanken-Dokument wurde
für diesen Versuch eingefroren; Produktionsprompts und EGM-Zustand wurden nicht
geändert.

Für einen späteren Wirksamkeitsnachweis wären vollständige Frage- und
Entscheidungsübergabe, eindeutige Zustimmungsbedingungen, Vergleiche mit gleichem
Zielumfang, weitere unabhängige Durchläufe und Modellvariation nötig. Reale
menschliche Beteiligung wird erst erforderlich, wenn Aussagen über menschliches
Verständnis, Aufwand oder Risikoentscheidungen getroffen werden sollen. Sie ist
keine Voraussetzung für den Abschluss dieser ausdrücklich agentischen Simulation.

## Belege und Wiederaufnahme

- [Vorabprotokoll](PROTOCOL.md), [Nachversuchsprotokoll](FOLLOWUP_PROTOCOL.md)
  und [Laborbuch](LAB_NOTES.md) bleiben von dieser nachträglichen Auswertung getrennt.
- [ARCHIVE.json](ARCHIVE.json) enthält Lauf-IDs, tatsächliche Modellauswahl,
  Eingabehashes und Verweise auf Rohdaten. Die Ablage ist lokaler Thread-Speicher;
  ein Repository-Klon allein enthält diese großen Artefakte nicht.
- [Hauptdaten und Materialisierungen](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/aggregate.json),
  [Entscheidungsproben](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/followup-results.json),
  [Stressprobe](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/uncertainty_holdout-results.json)
  und [Wiederholungen](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/uncertainty_repeat-results.json).
- [Fragen-Diagnose](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/question_audit-results.json),
  [deterministische Ablaufchecks](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/flow-checks.json)
  und [unabhängige Methodenprüfung](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01/method-audit-readable.json).
