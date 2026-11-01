# Autonome EGM-Forschung

Issue: `bb-elephant-goldfish-viw`. Die Forschung vergleicht EGM-Regeln an einer
unabhängigen Kopie des Mail-Gateways. Alle menschlichen Entscheidungen im Versuch
werden durch getrennte Agenten simuliert; sie gelten ausschließlich dort.

- [Vorabprotokoll](PROTOCOL.md): Fragen, Bedingungen, Rollen, Messung und Grenzen.
- [Gezielte Entscheidungsversuche](FOLLOWUP_PROTOCOL.md): drei strittige Fragen.
- [Aufbau und Abweichungen](LAB_NOTES.md): erhaltene Fehlversuche und Grenzen.
- [Ergebnisse](RESULTS.md): einheitliche Auswertung und Antworten auf die drei Fragen.
- [Archivindex](ARCHIVE.json): Läufe, Eingabehashes und tatsächliche Worker-Auswahl.
- [Leitplanken als Ausgangspunkt](../../docs/overengineering-leitplanken.md).

## Reproduzierbare Bestandteile

- `prepare.py`: unabhängiger Klon, Hashmanifest, drei Quellpakete und sechs Kopien.
- `build_inputs.py`: gepaarte Bedingungen und festgelegte Zellzuordnung.
- `workflow.js`: frische Rollen, zwei Reviewrunden und simulierter Entscheider.
- `followup.js`: kurze Entscheidungen und getrennte Modellbewertungen;
  zwölf erste Proben, vier Stress-/Kontrollproben und vier Wiederholungen.
- `restore_mutation.py`: synthetischer Gegenversuch zur Restore-Sperre.
- `restore_control.py`: Baseline und Mutation mit gleichem angepasstem Test,
  eigenen Umgebungen und tatsächlichen Kindprozess-Importnachweisen.
- `flow_checks.mjs`: deterministische Diagnose der Frageweitergabe,
  bedingter Zustimmung und Ablehnungszweige des tatsächlichen Forschungsablaufs.
- `question_audit.js`, `method_audit.js`: nachträgliche Fragen- und Methodenprüfung.
- `adjudicate.py`: einheitliche Einordnung der sechs Endzustände ohne Überschreiben
  früherer Modellurteile.
- `audit_events.py`: Werkzeugnamen und numerische Nutzung; keine privaten
  Reasoning-Inhalte als Forschungsartefakte.
- `collect.py`: vollständige Rohdaten sichern, Zustandsfolge prüfen und ausschließlich
  simuliert bestätigte Texte in den Fallkopien materialisieren.

Große Artefakte liegen im [Forschungsverzeichnis](/Users/marco/.bb/thread-storage/thr_vktjatb29v/egm-research-2026-11-01).
Dort halten `manifest.json`, `runs.json`, `prompt-templates.json`,
`batch-*-args.json` und `followup-args.json` die tatsächlich verwendeten Eingaben
fest. `runs/` enthält die gespeicherten Workflow-Seiten; `cells/` hält Projektkopien,
Revisionen, Entscheidungen und Messwerte. Die Ablage ist lokaler Thread-Speicher;
die Berichte im Repository allein enthalten nicht alle Rohdaten.

`workflow.js` bleibt als tatsächlich ausgeführte Version erhalten. Bekannte
Grenzen: separate Autorenfragen werden unvollständig weitergegeben;
`approve`-Bedingungen werden nicht semantisch auf Erfüllung geprüft. Der
Ergebnisbericht trennt daher Dokumentbestätigung, offene Voraussetzungen,
akzeptierte Umfangsreduktion und operative Autorität. Die Diagnose verändert
weder die ursprünglichen Trials noch produktives EGM-Verhalten.

Workflow-Quellen vor jedem Start mit `bb workflows validate --file <datei>` prüfen.
Die gespeicherten JSON-Eingaben als echte Objekte an `bb_workflow_run` übergeben.
Neue Aufbauläufe brauchen ein frisches Zielverzeichnis; vorhandene Durchläufe
werden nicht überschrieben oder still ersetzt. Das Replay eines gespeicherten
Workflows ersetzt keine unabhängige Wiederholung mit frischen Agenten.
