import { beforeEach } from "vitest";
import { setLanguage } from "../../src/i18n/language";

// Le banc historique est en français ; les scénarios i18n fixent explicitement leur langue.
beforeEach(() => setLanguage("fr"));
