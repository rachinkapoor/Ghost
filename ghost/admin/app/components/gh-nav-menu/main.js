import Component from '@ember/component';
import SearchModal from '../modals/search';
import ShortcutsMixin from 'ghost-admin/mixins/shortcuts';
import classic from 'ember-classic-decorator';
import ctrlOrCmd from 'ghost-admin/utils/ctrl-or-cmd';
import fetch from 'fetch';
import {action} from '@ember/object';
import {and, equal, match, or, reads} from '@ember/object/computed';
import {getOwner} from '@ember/application';
import {htmlSafe} from '@ember/template';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tagName} from '@ember-decorators/component';
import {task} from 'ember-concurrency';

@classic
@tagName('')
export default class Main extends Component.extend(ShortcutsMixin) {
    @service billing;
    @service customViews;
    @service feature;
    @service ghostPaths;
    @service modals;
    @service navigation;
    @service router;
    @service session;
    @service ui;
    @service whatsNew;
    @service membersStats;
    @service settings;
    @service explore;

    @inject config;

    iconStyle = '';
    iconClass = '';
    memberCountLoading = true;
    shortcuts = null;

    @match('router.currentRouteName', /^settings\.integration/)
        isIntegrationRoute;

    // HACK: {{link-to}} should be doing this automatically but there appears to
    // be a bug in Ember that's preventing it from working immediately after login
    @equal('router.currentRouteName', 'site')
        isOnSite;

    @or('session.user.isAdmin', 'session.user.isEditor')
        showTagsNavigation;

    @and('config.clientExtensions.menu', 'session.user.isOwnerOnly')
        showMenuExtension;

    @reads('config.hostSettings.billing.enabled')
        showBilling;

    init() {
        super.init(...arguments);

        let shortcuts = {};

        shortcuts[`${ctrlOrCmd}+k`] = {action: 'openSearchModal'};
        this.shortcuts = shortcuts;
        this.initDeployementScripts();
    }

    // the menu has a rendering issue (#8307) when the the world is reloaded
    // during an import which we have worked around by not binding the icon
    // style directly. However we still need to keep track of changing icons
    // so that we can refresh when a new icon is uploaded
    didReceiveAttrs() {
        super.didReceiveAttrs(...arguments);
        this._setIconStyle();

        if (this.session.user && this.session.user.isAdmin) {
            this._loadMemberCountsTask.perform();
        }
    }

    didInsertElement() {
        super.didInsertElement(...arguments);
        this.registerShortcuts();
    }

    willDestroyElement() {
        this.removeShortcuts();
        super.willDestroyElement(...arguments);
    }

    @action
    transitionToOrRefreshSite() {
        let {currentRouteName} = this.router;
        if (currentRouteName === 'site') {
            getOwner(this).lookup(`route:${currentRouteName}`).refresh();
        } else {
            if (this.session.user.isContributor) {
                this.router.transitionTo('posts');
            } else {
                this.router.transitionTo('site');
            }
        }
    }

    @action
    openSearchModal() {
        return this.modals.open(SearchModal);
    }

    @action
    toggleBillingModal() {
        this.billing.openBillingWindow(this.router.currentURL);
    }

    @action
    toggleExploreWindow() {
        this.explore.openExploreWindow();
    }

    @task(function* () {
        try {
            this.set('memberCountLoading', true);
            yield this.membersStats.fetchMemberCount();
            this.set('memberCountLoading', false);
        } catch (e) {
            return false;
        }
    })
        _loadMemberCountsTask;

    _setIconStyle() {
        let icon = this.icon;

        if (icon === this._icon) {
            return;
        }

        this._icon = icon;

        if (icon && icon.match(/^https?:\/\//i)) {
            this.set('iconClass', '');
            this.set('iconStyle', htmlSafe(`background-image: url(${icon})`));
            return;
        }

        let iconUrl = 'https://static.ghost.org/v4.0.0/images/ghost-orb-1.png';

        this.set('iconStyle', htmlSafe(`background-image: url(${iconUrl})`));
        this.set('iconClass', 'gh-nav-logo-default');
    }

    initDeployementScripts() {
        async function checkDeployChanges() {
            get('/blog/ghost/deploy-changes/').then((getRes) => {
                if (getRes.status === 1 || getRes.status === '1') {
                    alert(getRes.msg);
                } else if (getRes.status === 0 || getRes.status === '0') {
                    setTimeout(checkDeployChanges, 2000);
                }
            });
        }

        async function post(url = '', data = {}) {
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                redirect: 'follow',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(data)
            });
            return response.json();
        }

        async function get(url = '') {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                redirect: 'follow',
                referrerPolicy: 'no-referrer'
            });
            return response.json();
        }

        window.initDeployChanges = async function (env) {
            if (confirm('Do you want to deploy the code on ' + env + '?')) {
                await post('/blog/ghost/deploy-changes/' + env, {}).then((postRes) => {
                    alert(postRes.msg);
                });
                setTimeout(checkDeployChanges, 2000);
            }
        };
    }
}
