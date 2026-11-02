import type { JiraClient } from "../jira/client";
import type { JiraSprint } from "../jira/models";

// Sprints que l'utilisateur peut modifier (bug de l'essai du 02/11/2026). Jira exige « Gérer les
// sprints » sur tous les projets du board d'origine du sprint, ou l'administration de Jira ;
// sinon il répond « Only a Jira administrator can update this sprint » au premier geste.
// Lectures seules. Un cas indécidable garde le sprint : le refus de Jira reste affiché au geste.

export type SprintPermissionReader = Pick<JiraClient, "boardProjectKeys" | "myPermissions">;

export const MANAGE_SPRINTS = "MANAGE_SPRINTS_PERMISSION";
export const ADMINISTER = "ADMINISTER";

/**
 * Lectures déjà faites, partagées entre deux appels (`null` : indécidable). L'appelant la vide
 * pour relire Jira (actualisation, changement de board).
 */
export interface SprintPermissionCache {
  administrator?: Promise<boolean | null>;
  readonly boardProjects: Map<number, Promise<readonly string[] | null>>;
  readonly projects: Map<string, Promise<boolean | null>>;
}

export function sprintPermissionCache(): SprintPermissionCache {
  return { boardProjects: new Map(), projects: new Map() };
}

/** Lecture qui échoue : indécidable, jamais une erreur affichée. */
function orNull<T>(promise: Promise<T>): Promise<T | null> {
  return promise.catch(() => null);
}

/**
 * Identifiants des sprints proposables : modifiables, ou indécidables (sprint sans board
 * d'origine, board sans projet référencé, lecture refusée ou en échec). Un sprint n'est retiré
 * que si Jira dit explicitement que l'utilisateur n'a pas « Gérer les sprints » sur l'un des
 * projets de son board d'origine.
 */
export async function proposableSprintIds(
  reader: SprintPermissionReader,
  sprints: readonly JiraSprint[],
  cache: SprintPermissionCache = sprintPermissionCache(),
): Promise<Set<number>> {
  const all = new Set(sprints.map((sprint) => sprint.id));
  if (sprints.every((sprint) => sprint.originBoardId === null)) return all;
  cache.administrator ??= orNull(
    reader.myPermissions([ADMINISTER]).then((granted) => granted[ADMINISTER] === true),
  );
  if ((await cache.administrator) === true) return all;

  const projectsOf = (boardId: number) => {
    let read = cache.boardProjects.get(boardId);
    if (!read) {
      read = orNull(reader.boardProjectKeys(boardId));
      cache.boardProjects.set(boardId, read);
    }
    return read;
  };
  const manages = (projectKey: string) => {
    let read = cache.projects.get(projectKey);
    if (!read) {
      read = orNull(
        reader
          .myPermissions([MANAGE_SPRINTS], projectKey)
          .then((granted) => granted[MANAGE_SPRINTS] === true),
      );
      cache.projects.set(projectKey, read);
    }
    return read;
  };

  const refused = await Promise.all(
    sprints.map(async (sprint) => {
      if (sprint.originBoardId === null) return false;
      const projects = await projectsOf(sprint.originBoardId);
      if (!projects || projects.length === 0) return false;
      const rights = await Promise.all(projects.map(manages));
      return rights.some((right) => right === false);
    }),
  );
  return new Set(sprints.filter((_, index) => !refused[index]).map((sprint) => sprint.id));
}
