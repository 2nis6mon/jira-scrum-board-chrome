import type { BoardConfiguration } from "../../../core/boardConfiguration";
import { MAX_DAILY_MINUTES, MAX_DAILY_STOCK } from "../../../core/boardConfiguration";
import {
  AUTO_REFRESH_CHOICES,
  type SettingResult,
  withAgingThreshold,
  withDailyMinutes,
  withDailyStockLimit,
} from "../../../core/boardSettings";
import type { BoardModel } from "../../model/BoardModel";
import { Segmented, Stepper } from "./controls";
import { JqlSwimlaneSettings } from "./JqlSwimlaneSettings";

/** Swimlanes enregistrées explicitement, puis préférences d'affichage immédiates. */
export function BoardSettings({
  board,
  configuration,
}: {
  board: BoardModel;
  configuration: BoardConfiguration;
}) {
  const set = (change: (current: BoardConfiguration) => BoardConfiguration) =>
    void board.applySettings(change, { resync: false });
  const commit = (change: (current: BoardConfiguration) => SettingResult): string | null => {
    const preview = change(configuration);
    if (!preview.ok) return preview.error;
    set((current) => {
      const latest = change(current);
      return latest.ok ? latest.configuration : current;
    });
    return null;
  };
  return (
    <>
      <JqlSwimlaneSettings board={board} configuration={configuration} />
      <section class="settings-card" aria-labelledby="settings-display">
        <header class="settings-card-header">
          <div class="settings-card-title">
            <h2 id="settings-display">Affichage et daily</h2>
            <p class="settings-help">Enregistrés dès qu'ils sont modifiés.</p>
          </div>
        </header>
        <div class="settings-tiles">
          <Stepper
            id="settings-aging"
            label="Seuil « vieillissant »"
            value={configuration.agingThresholdDays}
            min={1}
            max={365}
            unit="jours"
            help="Sans changement de statut : la carte le signale."
            onCommit={(raw) => commit((current) => withAgingThreshold(current, raw))}
          />
          <Stepper
            id="settings-daily"
            label="Durée de la daily"
            value={configuration.dailyMinutes}
            min={1}
            max={MAX_DAILY_MINUTES}
            unit="minutes"
            help="Minuteur du mode Daily."
            onCommit={(raw) => commit((current) => withDailyMinutes(current, raw))}
          />
          <Stepper
            id="settings-daily-stock"
            label="Stock en daily"
            value={configuration.dailyStockLimit}
            min={1}
            max={MAX_DAILY_STOCK}
            unit="cartes"
            help="Dans la première colonne de chaque swimlane, avant « + N autres »."
            onCommit={(raw) => commit((current) => withDailyStockLimit(current, raw))}
          />
          <div class="settings-tile">
            <span class="settings-tile-label">
              Rafraîchissement automatique
              <span class="settings-badge settings-badge-personal">Personnel</span>
            </span>
            <Segmented
              label="Rafraîchissement automatique"
              name="settings-auto-refresh"
              value={String(configuration.autoRefreshSeconds ?? "")}
              choices={AUTO_REFRESH_CHOICES.map((seconds) => ({
                id: seconds === null ? "" : String(seconds),
                label: seconds === null ? "Désactivé" : `${seconds / 60} min`,
              }))}
              onChange={(value) =>
                set((current) => ({
                  ...current,
                  autoRefreshSeconds: value === "" ? null : Number(value),
                }))
              }
            />
            <span class="settings-help">
              Gardé dans ce navigateur. Lecture seule : relit Jira, n'écrit rien.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
