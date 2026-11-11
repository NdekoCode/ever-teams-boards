import React from "react";
import { useAtomValue } from "jotai";
import { LinkIcon } from "../../src/components/icons";
import { MainMenu } from "../../src/packages/excalidraw/index";
import { LanguageList } from "./LanguageList";
import { everTeamsOriginAtom } from "../auth/everTeamsOrigin";

export const AppMainMenu: React.FC<{
  setCollabDialogShown: (toggle: boolean) => any;
  isCollaborating: boolean;
  isCollabEnabled: boolean;
}> = React.memo((props) => {
  // Back to the Ever Teams deployment of this visit
  const everTeamsOrigin = useAtomValue(everTeamsOriginAtom);
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
      {props.isCollabEnabled && (
        <MainMenu.DefaultItems.LiveCollaborationTrigger
          isCollaborating={props.isCollaborating}
          onSelect={() => props.setCollabDialogShown(true)}
        />
      )}

      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      {everTeamsOrigin && (
        <MainMenu.ItemLink
          icon={LinkIcon}
          target="_self"
          href={everTeamsOrigin}
        >
          Ever Teams
        </MainMenu.ItemLink>
      )}
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.ItemCustom>
        <LanguageList style={{ width: "100%" }} />
      </MainMenu.ItemCustom>
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
});
