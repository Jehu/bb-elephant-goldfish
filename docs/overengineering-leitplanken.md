# EGM: Gründlichkeit erhalten, Overengineering begrenzen

Stand: 1. November 2026. Diskussionsgrundlage, kein freigegebener
Implementierungsplan. Issue: `bb-elephant-goldfish-m2m`.

## Ziel und feste Vorgaben

EGM soll Fehler und unklare Anforderungen früh sichtbar machen und zugleich
verhindern, dass Reviews den Funktionsumfang, technische Garantien und
Betriebsaufwand unbeabsichtigt ausweiten. Einfachheit bedeutet eine vollständige,
angemessene Lösung für den vereinbarten Einsatz. Weniger Code oder weniger
Findings allein belegen keine bessere Lösung.

**Das BB-Plugin bleibt agentenunabhängig.** Die erforderlichen Regeln müssen
vom Plugin selbst bereitgestellt und Elephant sowie Goldfish ausdrücklich
mitgegeben werden. Persönliche oder extern installierte Skills dürfen keine
Voraussetzung sein. BB-Worker und Advanced Endpoint müssen dieselben fachlichen
Leitplanken erhalten; frische Reviewer dürfen dafür kein Gesprächsgedächtnis
benötigen.

Der Mensch entscheidet über Anforderungen, zusätzliche Garantien, akzeptierte
Risiken und Änderungen am Dokument. Eine vereinfachte Variante darf zur Wahl
stehen; bestehende bestätigte Verträge werden dadurch nicht automatisch geändert.
Notwendige Schutzmaßnahmen gegen Datenverlust, ungewisse Seiteneffekte und
unvertrauenswürdige Eingaben bleiben erhalten.

## Grundlage und Aussagegrenzen

Die Untersuchung verbindet die EGM-Originalanleitung, die vorhandene BB-Adaption
und eine ausschließlich lesende Fallstudie des Infomaniak AI Mail Gateway unter
`/Users/marco/coding/infomaniak-ai-mail-gateway`, Stand `8f1e940`.

Gelesen wurden Produktbeschreibung, ursprünglicher Brief, Teile der verbindlichen
Spezifikation, Änderungshistorie, mehrere Review-Berichte sowie zentrale Pfade
für Koordination, Versandnachpflege, Wiederherstellung und API-Verträge.
Das war keine vollständige Codeprüfung. Am Gateway wurden keine Dateien geändert,
keine Tests ausgeführt und keine Dienste oder Mailverbindungen gestartet.

EGM enthält bereits eine Zoom-out-Persona gegen spekulative Funktionen,
unnötige Abstraktionen und vorzeitige Optimierung. Die BB-Adaption verwendet sie
im vollständigen Review zweimal und unterstützt gezielte Reviewer,
Trade-off-Entscheidungen und ein Rundenlimit. Die vorgeschlagenen Verbesserungen
sollen diese bestehenden Mechanismen schärfen.

## Wie Komplexität entstehen kann

Die zentrale Arbeitshypothese lautet: Reviews können technische Entscheidungen
schrittweise zu immer stärkeren verbindlichen Garantien machen. Spätere Reviewer
fordern dann deren vollständige Absicherung, ohne erneut zu prüfen, ob der
ursprüngliche Nutzerzweck diese Garantien benötigt.

Der mögliche Ablauf:

1. Ein begrenzter Nutzerwunsch führt zu einer technischen Lösung.
2. Die Lösung erzeugt neue Zustände, Fehlerfälle und Wiederherstellungsprobleme.
3. Reviews entdecken diese Probleme und ergänzen berechtigte Absicherungen.
4. Die zusätzlichen Garantien werden Teil des Vertrags und erzeugen weitere
   Wechselwirkungen.
5. Einfachere Alternativen erfüllen den inzwischen erweiterten Vertrag nicht
   mehr und werden deshalb verworfen.

Das macht einzelne Findings nicht falsch. Es verschiebt aber die entscheidende
Frage von „Wie sichern wir diese Lösung vollständig ab?“ zu „Welche Lösung und
welche Garantien brauchen wir für den Nutzerzweck?“.

Der Readiness-Standard kann diesen Effekt verstärken: Seine „Zero-Decision Rule“
verlangt vorab geklärte Design- und Architekturentscheidungen. Eine zu weite
Auslegung kann gewöhnliche Implementierungsdetails zu zusätzlichen Pflichten
machen. Das ist eine Hypothese über die Anwendung der Methode, kein Nachweis,
dass EGM allein das Wachstum des Gateway-Projekts verursacht hat.

## Erkenntnisse aus dem Mail-Gateway

Die Grundarchitektur ist bewusst begrenzt: eine Mailbox, ein lokaler Dienst,
SQLite und wenige Bibliotheken; angenommen werden höchstens etwa 50 eingehende
Mails täglich. In den untersuchten Pfaden liegt die Komplexität vor allem in
Garantien, Zustandsübergängen und deren Zusammenspiel.

Die Spezifikation wuchs vom ersten eingecheckten Stand `ef97a8e` mit 2.469 Zeilen
und rund 21.700 Wörtern auf 4.801 Zeilen und rund 43.400 Wörter. Diese aus Git
ermittelten Größen sind ein Signal für Vertragswachstum, kein Qualitätsurteil.
Ein Teil des Wachstums folgt ausdrücklich menschlich bestätigten Erweiterungen.

| Beobachtung | Folgerung für EGM |
|---|---|
| Sichtbare Antworten im normalen Mailprogramm führen zu dauerhafter Gesendet-Nachpflege mit MIME-Aufbewahrung, getrenntem Fortschritt, Wiederanlauf und Restore-Sperren. | Nutzerziel und gewählte technische Garantien unterscheiden; Folgekosten vor der Entscheidung sichtbar machen. |
| Explizites „als gelesen markieren“ besitzt Vorgangskennungen, Fortschritt je Mitgliedschaft und Wiederholungsregeln, damit spätere manuelle Änderungen nicht überschrieben werden. | Den Aufwand kleiner sichtbarer Funktionen anhand ihrer Zustände und Lebenszyklen beurteilen. |
| Issue #19 dokumentiert einen tatsächlich reproduzierten doppelten APPEND nach Restore; ein heutiger Regressionstest sichert den Fall ab. | Konkrete Fehler innerhalb des vereinbarten Designs nicht pauschal als Overengineering abtun. |
| Derselbe Review enthält überlappende MIME-Lifecycle-Findings und redaktionelle Punkte neben Sicherheitsproblemen. | Findings nach Ursache bündeln und nach Handlungsbedarf einordnen. Ihre Anzahl ist keine Zahl notwendiger Änderungen. |
| Issue #51 belegt begrenzte HTTP-Probe-Verfügbarkeit und dokumentiert die Grenze, ohne automatisch Transporthärtung zu beauftragen. Die betriebliche Akzeptanz bleibt offen. | Eine belegte Betriebsgrenze ist ein zulässiges Review-Ergebnis; zusätzliche Garantien benötigen eine eigene Entscheidung. |
| Der Polling-Endpunkt liefert Erstentdeckungen, aber keine Updates. Consumer benötigen erneute Detailabfragen und teilweise eigene dauerhafte Nachprüflisten. | Einfachheit über Gateway, Consumer und Betreiber gemeinsam bewerten; verlagerte Arbeit mitrechnen. |
| Der Cursor-Vertrag enthält sowohl Schutz gegen einen konkreten Integer-Überlauf als auch genaue Encoding- und Fehlerpräzedenzregeln. | Wesentliche Verhaltensgarantien von Implementierungsdetails unterscheiden und ihren Nutzen jeweils begründen. |

Diese Befunde begründen keine pauschale Löschliste für das Gateway. Seine
gewählte Lösung enthält nachvollziehbare Absicherungen und bereits dokumentierte
Alternativen. Der stärkste Ansatzpunkt liegt vor der nächsten Vertragserweiterung.

## Vorgeschlagene Leitplanken

### 1. Nutzerzweck und Projektgrenzen gemeinsam festhalten

Elephant und jeder Goldfish erhalten den Nutzerzweck, aktuelle Anwendungsfälle,
Nicht-Ziele, erwartete Größenordnung, Vertrauensgrenzen und bewusst begrenzte
Garantien. Anforderungen und technische Mittel bleiben erkennbar unterscheidbar.
Eine mögliche spätere Nutzung allein rechtfertigt keine zusätzliche Komplexität.

### 2. Folgekosten vor einer Erweiterung offenlegen

Bevor eine Funktion oder Garantie freigegeben wird, benennt der Elephant ihre
wesentlichen Folgen: dauerhafter Zustand, Wiederanlauf, Backup/Restore,
Retention, Nebenläufigkeit, Betreiberpflichten und Consumer-Aufwand.

Neue Abstraktionen, Abhängigkeiten oder Betriebsmechanismen brauchen eine aktuelle
Anforderung oder ein konkretes Fehlerszenario als Begründung. Bei relevanter
Folgelast gehört eine einfachere Variante mit begrenzter Garantie zur Entscheidung.
Ein langer Spec-Diff allein ersetzt diese Erläuterung nicht.

### 3. Findings belegen, einordnen und bündeln

Zu einem wesentlichen Finding gehören die betroffene Anforderung, das konkrete
Fehlerszenario, realistische Eintrittsbedingungen, der Schaden und die Belege.
Annahmen und offene Nachweise bleiben als solche gekennzeichnet.

| Art des Findings | Umgang |
|---|---|
| Fehler gegenüber einer bestehenden Anforderung | Kleinste ausreichende Korrektur suchen. |
| Neue, bisher nicht vereinbarte Garantie | Als Umfangsentscheidung vorlegen; nicht still als Pflicht behandeln. |
| Unklare Dokumentation | Bestehenden Vertrag klären, bevor daraus neue Runtime-Arbeit entsteht. |
| Bekannte Grenze oder bereits entschiedener Trade-off | Neue Erkenntnis oder veränderte Annahme benennen, die eine erneute Entscheidung rechtfertigt. |

Diese Einordnung ergänzt die Schweregrade; sie ersetzt sie nicht. Mehrere
Findings zur selben Ursache werden gemeinsam bewertet. Weder Zustimmung noch
Bestreiten erfolgt automatisch.

### 4. Auch die gewählte Lösung hinterfragen dürfen

Der Elephant prüft neben einer Korrektur auch, ob eine einfachere Lösung oder
ein engerer unterstützter Umfang den Nutzerzweck erfüllt. Bei hoher Folgelast
führt er die Begründung bis zur ursprünglichen Anforderung zurück.

Bestehende Entscheidungen dürfen begründet erneut zur Wahl gestellt werden.
Der Mensch entscheidet ausdrücklich über Vertragsänderungen. Akzeptierte Risiken
bleiben Risiken; eine dokumentierte Grenze wird erst durch eine tatsächliche
menschliche Entscheidung zum akzeptierten Trade-off. Neue Belege können eine
erneute Prüfung erforderlich machen.

### 5. Readiness und Review-Aufwand begrenzen

Notwendige Architekturentscheidungen werden vorab geklärt. Gewöhnliche
Implementierungsdetails dürfen beim ausführenden Agenten bleiben. Bei exakten
Detailregeln wird begründet, ob sie Daten schützen, einen konkreten Fehler
verhindern oder von einem Consumer benötigt werden.

Review-Tiefe und Kontextumfang folgen Tragweite, Risiko und Umkehrbarkeit der
Änderung. Kleine lokale Änderungen benötigen nicht automatisch den vollständigen
EGM-Durchlauf. Bei großen Dokumenten sollen betroffene Bereiche und ihre
Wechselwirkungen gezielt geprüft werden, ohne relevante Verträge auszublenden.

### 6. Die Gesamtlösung und ihren Abschluss bewerten

Eine Vereinfachung benennt, welche Arbeit beim Dienst, bei Consumern und beim
Betreiber verbleibt. Weniger Aufwand in einem Modul darf nicht automatisch als
Vereinfachung des Gesamtsystems gelten.

Der Abschluss richtet sich nach den vereinbarten Anforderungen, entschiedenen
wesentlichen Risiken und angemessener Verifikation. Weitere Review-Runden
brauchen einen konkreten Anlass. Ein erreichtes Rundenlimit oder null offene
Findings belegen keine unabhängige Prüfung der zuletzt geänderten Fassung.
Bekannte Entscheidungen müssen auch in frischen Reviewer-Kontexten verfügbar sein.

## Ansatz für das BB-Plugin

Zunächst die bestehenden Prompts, Standards und die Anleitung für den Elephant
konsistent um diese Regeln ergänzen. Der gemeinsame Review-Vertrag muss bei
beiden Engines einschließlich frischer Kontexte ankommen. Zusätzliche Reviewer,
Prozessstufen, Schemas oder Abhängigkeiten sind dafür noch nicht begründet.

Die ersten drei Schwerpunkte wären:

1. Wesentliche Findings an bestehende Anforderungen und konkrete Fehlerszenarien
   binden und Überschneidungen gemeinsam behandeln.
2. Vor zusätzlichen Garantien und dauerhaften Zuständen die Folgekosten sichtbar
   machen und eine begrenztere Alternative zur Wahl stellen.
3. Projektgrenzen und menschliche Entscheidungen zuverlässig in weitere Reviews
   mitnehmen, ohne neue Belege auszuschließen.

## Offene Entscheidungen und Prüfung der Wirkung

- Welche Regeln sind verbindlich, welche projektspezifisch anpassbar?
- Wie werden Anforderungen, Grenzen und getroffene Entscheidungen mit möglichst
  wenig Pflegeaufwand erfasst und an Elephant und Goldfish übergeben?
- Wie unterscheiden wir notwendige Designentscheidungen von Implementierungsdetails?
- Wie werden Finding-Einordnung und Überschneidungen im bestehenden Ablauf nutzbar,
  ohne einen zusätzlichen Verwaltungsprozess einzuführen?
- Welche Review-Tiefe und Abschlussregel passt zu welcher Aufgabenart?

Die Wirkung soll an derselben Ausgangsversion einer bestehenden Spezifikation
verglichen werden: Welche konkreten Fehler bleiben erkennbar? Welche Änderungen
werden kleiner oder entfallen? Welche neuen Garantien und Betreiberpflichten
entstehen? Wie viel Arbeit wird zu Consumern verlagert? Wie viel Review- und
Entscheidungsaufwand fällt an?

Dokumentlänge, Codeumfang und Finding-Anzahl sind ergänzende Signale. Weniger
Findings, kürzere Dokumente oder ein früherer Abbruch allein gelten nicht als
Erfolgsnachweis. Die Regeln sind hier noch nicht implementiert oder erprobt.

## Quellen

### Methode und BB-Adaption

- [EGM-Anleitung](https://github.com/google/elephant-goldfish-model/blob/main/docs/getting_started.md): bedarfsgerechte Anwendung und Auswahl relevanten Feedbacks.
- [Zoom-out-Persona](https://github.com/google/elephant-goldfish-model/blob/main/agents/zoom_out.md): Einfachheit, Wiederverwendung und YAGNI.
- [Readiness-Standard](https://github.com/google/elephant-goldfish-model/blob/main/resources/document_standards/implementation-readiness-standard.md): Zero-Decision Rule.
- [Upstream-Issue #258](https://github.com/google/elephant-goldfish-model/issues/258): berichtetes unnötiges Design-Dokument für einen Bugfix; ein Einzelfall.
- [Martin Fowler: YAGNI](https://martinfowler.com/bliki/Yagni.html): Kosten spekulativer Funktionalität und Flexibilität.
- BB: [Review-Presets](../server/prompts.ts), [Workflow und Kontextgrenzen](../README.md#workflow), [Finding-Auflösung](../skills/egm-resolve/SKILL.md).

### Lokale Fallstudie: Infomaniak AI Mail Gateway

Die Links verweisen auf den untersuchten lokalen Checkout; spätere Änderungen
können vom genannten Forschungsstand abweichen.

- [V1-Spezifikation](/Users/marco/coding/infomaniak-ai-mail-gateway/docs/designs/infomaniak-ai-mail-gateway.md): Größenannahmen, Mailbox-Nachpflege, Consumer-Konsistenz, Cursor-Vertrag und Alternativen.
- [Ursprünglicher Brief](/Users/marco/coding/infomaniak-ai-mail-gateway/docs/concepts/agentmail-replacement/concepts_brief.md): ursprüngliche Anforderungen und Nicht-Ziele, vorbehaltlich bestätigter Amendments.
- [Explizite Gelesen-Aktionen](/Users/marco/coding/infomaniak-ai-mail-gateway/src/mailgw/read_actions.py) und [Versandnachpflege](/Users/marco/coding/infomaniak-ai-mail-gateway/src/mailgw/mailbox_sync.py): dauerhafte Zustände und Wiederanlauf.
- [Issue #19](/Users/marco/coding/infomaniak-ai-mail-gateway/docs/reviews/issue-19-egm-resolution.md) und [Restore-Regression](/Users/marco/coding/infomaniak-ai-mail-gateway/tests/test_mailbox_sync.py): doppelte APPEND-Gefahr und heutige Absicherung.
- [Issue #51](/Users/marco/coding/infomaniak-ai-mail-gateway/docs/reviews/issue-51-http-transport-boundaries.md): belegte Transportgrenze und getrennte Härtungsentscheidung.
- [Issue #36](/Users/marco/coding/infomaniak-ai-mail-gateway/docs/reviews/issue-36-cursor-contract.md): konkrete Validierungslücke und detaillierter Cursor-Vertrag.
