define(
        ['require', 'jquery', 'underscore', 'bootstrap', 'pgadmin', 'alertify',
        'codemirror', 'jquery.contextmenu', 'wcdocker', 'pgadmin.browser.menu',
        'pgadmin.browser.error', 'pgadmin.browser.node',
        'pgadmin.browser.panel', 'pgadmin.browser.frame', 'jquery.aciplugin',
        'jquery.acitree', 'codemirror.sql', 'pgadmin.alertifyjs'],
function(require, $, _, Bootstrap, pgAdmin, alertify, CodeMirror) {

    var wcDocker = window.wcDocker;
    $ = $ || window.jQuery;
    Bootstrap = Bootstrap || window.Bootstrap;

    pgAdmin.Browser = pgAdmin.Browser || {};

    // TODO:: Remove dmeo SQL (once completed)
    var demoSql = '-- DROP TABLE tickets_detail; \n\
\n\
CREATE TABLE tickets_detail \n\
( \n\
  id serial NOT NULL, \n\
  ticket_id integer NOT NULL, \n\
  logger_id integer NOT NULL, \n\
  added timestamp with time zone NOT NULL, \n\
  detail text NOT NULL, \n\
  msgid character varying(100), \n\
  CONSTRAINT tickets_detail_pkey PRIMARY KEY (id), \n\
  CONSTRAINT ticket_id_refs_id_6b8dc130 FOREIGN KEY (ticket_id) \n\
  REFERENCES tickets_ticket (id) MATCH SIMPLE \n\
  ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED, \n\
  CONSTRAINT tickets_detail_logger_id_fkey FOREIGN KEY (logger_id) \n\
  REFERENCES auth_user (id) MATCH SIMPLE \n\
  ON UPDATE NO ACTION ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED \n\
) \n\
WITH ( \n\
        OIDS=FALSE \n\
     ); \n\
ALTER TABLE tickets_detail \n\
OWNER TO helpdesk;\n';

    _.extend(pgAdmin.Browser, {
        URL: {{ url_for('browser.index') }},
        docker:null,
        editor:null,
        tree:null,
        /* list of script to be loaded, when a certain type of node is loaded */
        scripts: {},
        panels: {
            'browser': new pgAdmin.Browser.Panel({
                name: 'browser',
                title: '{{ _('Browser') }}',
                showTitle: false,
                isClosable: false,
                isPrivate: true,
                content: '<div id="tree" class="aciTree"></div>'
            }),
            'properties': new pgAdmin.Browser.Panel({
                name: 'properties',
                title: '{{ _('Properties') }}',
                width: 500,
                isClosable: false,
                isPrivate: true,
                content: '<div id="obj_props" class="obj_properties">No object selected!</div>'
            }),
            'statistics': new pgAdmin.Browser.Panel({
                name: 'statistics',
                title: '{{ _('Statistics') }}',
                width: 500,
                isClosable: false,
                    isPrivate: true,
                    content: '<p>Statistics pane</p>'
                }),
            'sql': new pgAdmin.Browser.Panel({
                name: 'sql',
                title: '{{ _('SQL') }}',
                width: 500,
                isClosable: false,
                isPrivate: true,
                // TODO:: Revove demoSql later
                content: '<textarea id="sql-textarea" name="sql-textarea">' + demoSql + '</textarea>'
            }),
            'dependencies': new pgAdmin.Browser.Panel({
                name: 'dependencies',
                title: '{{ _('Dependencies') }}',
                width: 500,
                isClosable: false,
                isPrivate: true,
                content: '<p>Depedencies pane</p>'
            }),
            'dependents': new pgAdmin.Browser.Panel({
                name: 'dependents',
                title: '{{ _('Dependents') }}',
                width: 500,
                isClosable: false,
                isPrivate: true,
                content: '<p>Dependent pane</p>'
            })/* Add hooked-in panels */{% for panel_item in current_app.panels %}{% if not panel_item.isIframe %},'{{ panel_item.name }}' : new pgAdmin.Browser.Panel({
                name: '{{ panel_item.name }}',
                title: '{{ panel_item.title }}',
                width: {{ panel_item.width }},
                height: {{ panel_item.height }},
                showTitle: (Boolean('{{ panel_item.showTitle|lower }}') == true),
                isClosable: (Boolean('{{ panel_item.isCloseable|lower }}') == true),
                isPrivate: (Boolean('{{ panel_item.isPrivate|lower }}') == true),
                content: '{{ panel_item.content }}'
            }){% endif %}{% endfor %}
        },
        frames: {
            'dashboard': new pgAdmin.Browser.Frame({
                name: 'dashboard',
                title: '{{ _('Dashboard') }}',
                width: 500,
                isClosable: false,
                isPrivate: true,
                url: 'about:blank' /* TODO:: Change it with http://www.pgadmin.org later */
            })/* Add hooked-in frames */{% for panel_item in current_app.panels %}{% if panel_item.isIframe %},
            '{{ panel_item.name }}' : new pgAdmin.Browser.Frame({
                name: '{{ panel_item.name }}',
                title: '{{ panel_item.title }}',
                width: {{ panel_item.width }},
                height: {{ panel_item.height }},
                showTitle: (Boolean('{{ panel_item.showTitle|lower }}') == true),
                isClosable: (Boolean('{{ panel_item.isCloseable|lower }}') == true),
                isPrivate: (Boolean('{{ panel_item.isPrivate|lower }}') == true),
                url: '{{ panel_item.content }}'
            }){% endif %}{% endfor %}
        },
        modules: [],
        /* Menus */
        menus: {
            standard: {},
            object: {},
            tools: {},
            help: {},
            context: {}
        },
        register_script: function(n, m, p) {
            var scripts = this.scripts;
            scripts[n] = _.isArray(scripts[n]) ? scripts[n] : [];
            scripts[n].push({'name': m, 'path': p, loaded: false});
        },
        // Build the default layout
        buildDefaultLayout: function() {
            this.docker.addPanel('dashboard', wcDocker.DOCK_TOP, this.panels['properties'].panel);
            this.docker.addPanel('properties', wcDocker.DOCK_STACKED, this.frames['dashboard'].panel);
            this.docker.addPanel('sql', wcDocker.DOCK_STACKED, this.frames['dashboard'].panel);
            this.docker.addPanel('statistics', wcDocker.DOCK_STACKED, this.frames['dashboard'].panel);
            this.docker.addPanel('dependencies', wcDocker.DOCK_STACKED, this.frames['dashboard'].panel);
            this.docker.addPanel('dependents', wcDocker.DOCK_STACKED, this.frames['dashboard'].panel);

            this.docker.addPanel('browser', wcDocker.DOCK_LEFT, this.frames['dashboard'].panel);
        },
        // Enable/disable menu options
        enable_disable_menus: function(item) {
            /* New object menu mechanism */
            var obj_mnu = $('#navbar-menu > ul > li > #mnu_dropdown_obj'),
                create_mnu = $("#mnu_create_obj").empty(),
                d = this.tree.itemData(item);
            obj_mnu.children("li:not(:first-child)").remove();
            create_mnu.html('<li class="menu-item disabled"><a href="#">{{ _('No object selected') }}</a></li>\n');

            if (item && this.menus['object'] && this.menus['object'][d._type]) {
                var create_items = [];
                _.each(_.sortBy(this.menus['object'][d._type], function(o) { return o.priority; }), function(m) {
                    if (m.category && m.category == 'create') {
                        create_items.push(m.generate());
                    } else {
                        obj_mnu.append(m.generate());
                    }
                });
                /* Create menus goes seperately */
                if (create_items.length > 0) {
                    create_mnu.empty();
                    _.each(create_items, function(c) {
                        create_mnu.append(c);
                    });
                }
            }
        },
        // Get the selected treeview item type, or nowt
        get_selected_node_type: function() {
            item = this.tree.selected();
            if (!item || item.length != 1)
                return "";

            return this.tree.itemData(item)._type;
        },
        Init: function() {
            var obj=this;

            // Store the main browser layout
            $(window).bind('unload', function() {
                if(obj.docker) {
                    state = obj.docker.save();
                    settings = { setting: "Browser/Layout", value: state };
                    $.post("{{ url_for('settings.store') }}", settings);
                }
                return true;
            });

            obj.docker = new wcDocker('#dockerContainer');
            if (obj.docker) {
                _.each(obj.panels, function(panel, name) {
                    obj.panels[name].load(obj.docker);
                });
                _.each(obj.frames, function(frame, name) {
                    obj.frames[name].load(obj.docker);
                });

                var layout = '{{ layout }}';

                // Try to restore the layout if there is one
                if (layout != '') {
                    try {
                        obj.docker.restore(layout)
                    }
                    catch(err) {
                        obj.docker.clear()
                        obj.buildDefaultLayout()
                    }
                } else {
                    obj.buildDefaultLayout()
                }
            }

            // Syntax highlight the SQL Pane
            obj.editor = CodeMirror.fromTextArea(
                document.getElementById("sql-textarea"), {
                    lineNumbers: true,
                    mode: "text/x-sql",
                    readOnly: true,
                });

            // Initialise the treeview
            $('#tree').aciTree({
                ajax: {
                    url: '{{ url_for('browser.get_nodes') }}',
                    converters: {
                        'text json': function(payload) {
                            return $.parseJSON(payload).data;
                        }
                    }
                },
                ajaxHook: function(item, settings) {
                    if (item != null) {
                        var d = this.itemData(item);
                        settings.url = '{{ url_for('browser.index') }}' + d._type + '/nodes/' + (d.refid ? d.refid + '/' : '') + d._id
                    }
                }
            });
            obj.tree = $('#tree').aciTree('api');

            // Build the treeview context menu
            $('#tree').contextMenu({
                selector: '.aciTreeLine',
                build: function(element) {
                    var item = obj.tree.itemFrom(element),
                        menu = { },
                        createMenu = { },
                        d = obj.tree.itemData(item),
                        menus = obj.menus['context'][d._type],
                        cb = function(name) {
                            var o = undefined;

                            _.each(menus, function(m) {
                                if (name == m.module.type + '_' + m.callback) {
                                    o = m;
                                }
                            });

                            if (o) {
                                var cb = o.module['callbacks'] && o.module['callbacks'][o.callback] || o.module[o.callback];
                                if (cb) {
                                    cb.apply(o.module, [item, o.data]);
                                } else {
                                    pgAdmin.Browser.report_error('Developer Warning: Callback - "' + o.cb + '" not found!');
                                }
                            }
                        };

                    _.each(menus, function(m) {
                        if (m.category == 'create')
                            createMenu[m.module.type + '_' + m.callback] = { name: m.label, callback: cb };
                    });


                    menu["create"] = { "name": "{{ _('Create') }}" }
                    menu["create"]["items"] = createMenu


                    _.each(menus, function(m) {
                        if (m.category != 'create')
                            menu[m.module.type + '_' + m.callback] = { name: m.label, callback: cb };
                    });

                    return {
                        autoHide: true,
                        items: menu,
                        callback: null
                    };
                }
            });

            // Treeview event handler
            $('#tree').on('acitree', function(event, api, item, eventName, options) {
                var d = null;
                if (item) {
                    d = obj.tree.itemData(item);
                    if (d && obj.Nodes[d._type] &&
                        _.isObject(obj.Nodes[d._type].callbacks) &&
                        eventName in obj.Nodes[d._type].callbacks &&
                        typeof obj.Nodes[d._type].callbacks[eventName] ==
                            'function') {
                        return obj.Nodes[d._type].callbacks[eventName].apply(
                            obj.Nodes[d._type], [{
                                data: d, browser: obj, item: item,
                                eventName: eventName, options: options
                            }]);
                    }
                }
                switch (eventName){
                    case "added":
                        if (d) {
                            /* Loading all the scripts registered to be loaded on this node */
                            if (obj.scripts && obj.scripts[d._type]) {
                                _.each(obj.scripts[d._type], function(s) {
                                    if (!s.loaded) {
                                        require([s.name], function(m) {
                                            s.loaded = true;
                                            if (m && m.Init && typeof m.Init == 'function') {
                                                try {
                                                    m.Init();
                                                } catch (err) {
                                                    obj.report_error('{{ _('Error Initializing script - ') }}' + s.path, err);
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        }
                        break;
                }
            });
            {% for script in current_app.javascripts %}{% if 'when' in script %}{% if script['when'] is none %}
            /* Loading {{ script.path }} */
            require(['{{ script.name }}'], function(m) {}, function() { console.log (arguments); });{% else %}
            /* Registering '{{ script.path }}.js' to be loaded when a node '{{ script.when }}' is loaded */
            this.register_script('{{ script.when }}', '{{ script.name }}', '{{ script.path }}.js');{% endif %}{% endif %}{% endfor %}

            // Setup the menus
            obj.enable_disable_menus();
        },
        Action: function(action) {
            var obj = this,
            item = obj.tree.selected();

            if (item) {
                var d = obj.tree.itemData(item);

                if (d && obj.Nodes[d._type] &&
                    _.isObject(obj.Nodes[d._type].callbacks) &&
                    action in obj.Nodes[d._type].callbacks &&
                    typeof obj.Nodes[d._type].callbacks[eventName] ==
                    'function') {
                    return obj.Nodes[d._type].callbacks[eventName].apply(
                        obj.Nodes[d._type], [{
                            data: d, browser: obj, item: item,
                            eventName: action
                        }]);
                }
            }
        }
    });

    return pgAdmin.Browser;
});
