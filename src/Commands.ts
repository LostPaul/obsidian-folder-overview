import FolderNotesPlugin from '../../main';
import FolderOverviewPlugin from './main';
import { Menu, Editor, MarkdownView, stringifyYaml } from 'obsidian';

export function registerOverviewCommands(plugin: FolderOverviewPlugin | FolderNotesPlugin) {
    plugin.addCommand({
        id: 'open-folder-overview-settings',
        name: 'Open folder overview settings',
        callback: () => {
            plugin.activateOverviewView();
        }
    });

    plugin.addCommand({
        id: 'insert-folder-overview',
        name: 'Insert folder overview',
        editorCheckCallback: (checking: boolean, editor: Editor) => {
            const line = editor.getCursor().line;
            const lineText = editor.getLine(line);
            if (lineText.trim() === '' || lineText.trim() === '>') {
                if (!checking) {
                    let json = Object.assign({}, plugin instanceof FolderOverviewPlugin ? plugin.settings : plugin.settings.defaultOverview);
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
                }
                return true;
            }
            return false;
        },
    })

    plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
        const line = editor.getCursor().line;
        const lineText = editor.getLine(line);
        if (lineText.trim() === '' || lineText.trim() === '>') {
            menu.addItem((item) => {
                item.setTitle('Create folder overview')
                    .setIcon('edit')
                    .onClick(() => {
                        let json = Object.assign({}, plugin instanceof FolderOverviewPlugin ? plugin.settings : plugin.settings.defaultOverview);
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