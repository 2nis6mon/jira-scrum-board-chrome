import { type BoardConfiguration, visibleColumns } from "../../../core/boardConfiguration";
import type { BoardIssue } from "../../../core/boardIssue";
import type { CardField } from "../../../core/cardFields";
import type { BoardModel } from "../../model/BoardModel";
import { IssueCard } from "../board/IssueCard";

/**
 * Aperçu de quelques cartes du board, dessinées par la carte réelle. Inerte : ni lien, ni focus,
 * ni glissé. Les valeurs sont celles déjà lues dans Jira, rien n'est relu pour l'aperçu.
 */
export function CardPreview(props: {
  board: BoardModel;
  configuration: BoardConfiguration;
  issues: readonly BoardIssue[];
  cardFields: readonly CardField[];
  tints?: Readonly<Record<string, string>>;
}) {
  const { board, configuration } = props;
  const lastColumnId = visibleColumns(configuration.columns).at(-1)?.id ?? null;
  const parentColors = board.parentColors.value;
  return (
    <div class="settings-preview" inert>
      {props.issues.map((issue) => {
        const parentKey = issue.issue.fields.parent?.key;
        return (
          <IssueCard
            key={issue.issue.key}
            issue={issue}
            siteOrigin={board.site.origin}
            images={board.images}
            cardFields={props.cardFields}
            parentColor={parentKey ? (parentColors.get(parentKey) ?? null) : null}
            agingThresholdDays={configuration.agingThresholdDays}
            goalTitle={null}
            lastColumnId={lastColumnId}
            tint={props.tints?.[issue.issue.key] ?? null}
          />
        );
      })}
    </div>
  );
}
