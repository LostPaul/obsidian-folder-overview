import FolderOverviewPlugin from './main';
import { Menu, Editor, MarkdownView, stringifyYaml } from 'obsidian';

export function registerCommands(plugin: FolderOverviewPlugin) {
    plugin.addCommand({
        id: 'open-folder-overview-settings',
        name: 'Open Folder Overview settings',
        callback: () => {
            plugin.activateOverviewView();
        }
    });

    plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        const text = editor.getSelection().trim();
        const line = editor.getCursor().line;
        const lineText = editor.getLine(line);
        if (lineText.trim() === '' || lineText.trim() === '>') {
            menu.addItem((item) => {
                item.setTitle('Create folder overview')
                    .setIcon('edit')
                    .onClick(() => {
                        let json = Object.assign({}, plugin.settings);
                        json.id = crypto.randomUUID();
                        const yaml = stringifyYaml(json)
                        if (lineText.trim() === '') {
                            editor.replaceSelection(`\`\`\`folder-overview\n${yaml}\`\`\`\n`);
                        } else if (lineText.trim() === '>') {
                            // add > to the beginning of each line
                            const lines = yaml.split('\n');
                            const newLines = lines.map((line) => {
                                return `> ${line}`;
                            });
                            editor.replaceSelection(`\`\`\`folder-overview\n${newLines.join('\n')}\`\`\`\n`);
                        }
                    });
            });
        }
    }));
}