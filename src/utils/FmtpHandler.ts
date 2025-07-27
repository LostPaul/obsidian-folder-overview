import type { Events, ApiInterface, DeferInterface, ListenerRef, EventDispatcherInterface } from 'front-matter-plugin-api-provider';
import { getDefer } from 'front-matter-plugin-api-provider';
import type { App, TFile, TFolder } from 'obsidian';
import type FolderOverviewPlugin from '../main';
export class FrontMatterTitlePluginHandler {
	plugin: FolderOverviewPlugin;
	app: App;
	api: ApiInterface | null = null;
	deffer: DeferInterface | null = null;
	modifiedFolders: Map<string, TFolder> = new Map();
	eventRef: ListenerRef<'manager:update'>;
	dispatcher: EventDispatcherInterface<Events>;
	constructor(plugin: FolderOverviewPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;

		(async () => {
			this.deffer = getDefer(this.app);
			if (this.deffer.isPluginReady()) {
				this.api = this.deffer.getApi();
			} else {
				await this.deffer.awaitPlugin();
				this.api = this.deffer.getApi();
				if (!this.deffer.isFeaturesReady()) {
					await this.deffer.awaitFeatures();
				}
			}
			const dispatcher = this.api?.getEventDispatcher();
			if (dispatcher) {
				this.dispatcher = dispatcher;
			}
		})();
	}
	deleteEvent() {
		if (this.eventRef) {
			this.dispatcher.removeListener(this.eventRef);
		}
	}

	async getNewFileName(file: TFile): Promise<string | null> {
		const resolver = this.api?.getResolverFactory()?.createResolver('#feature-id#');
		const changedName = resolver?.resolve(file?.path ?? '');
		return changedName ?? null;
	}
}
