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
            context: {},
            file: {},
            edit: {},
            object: {},
            management: {},
            tools: {},
            help: {}
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
            var obj = this, j, e,
                navbar = $('#navbar-menu > ul').first(),
                obj_mnu = navbar.find('li#mnu_obj > ul#mnu_dropdown_obj').first(),
                create_mnu = navbar.find("#mnu_create_obj").empty(),
                d = this.tree.itemData(item);
            obj_mnu.children("li:not(:first-child)").remove();
            create_mnu.html('<li class="menu-item disabled"><a href="#">{{ _('No object selected') }}</a></li>\n');

            _.each([
                    {m: 'file', id: '#mnu_file'},
                    {m: 'edit', id: '#mnu_edit'},
                    {m: 'management', id: '#mnu_management'},
                    {m: 'tools', id: '#mnu_tools'},
                    {m: 'help', id:'#mnu_help'}], function(o) {
                        j = navbar.children(o.id).children('.dropdown-menu').first();
                        _.each(obj.menus[o.m],
                            function(v, k) {
                                e = j.find('#' + k).closest('.menu-item').removeClass('disabled');
                                if (v.disabled(obj)) {
                                    e.addClass('disabled');
                                }
                            });
                    });

            if (item && this.menus['object'] && this.menus['object'][d._type]) {
                var create_items = [];
                _.each(_.sortBy(
                            this.menus['object'][d._type],
                            function(o) { return o.priority; }),
                        function(m) {
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
        init: function() {
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
                                if (name == m.name) {
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

                    _.each(_.sortBy(
                                menus, function(m) { return m.priority; }),
                            function(m) {
                                if (m.category == 'create')
                                    createMenu[m.name] = { name: m.label };
                            });


                    menu["create"] = { "name": "{{ _('Create') }}" }
                    menu["create"]["items"] = createMenu

                    _.each(_.sortBy(
                                menus, function(m) { return m.priority; }),
                            function(m) {
                                if (m.category != 'create')
                                    menu[m.module.type + '_' + m.callback] = { name: m.label };
                            });

                    return {
                        autoHide: true,
                        items: menu,
                        callback: cb
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
                                            if (m && m.init && typeof m.init == 'function') {
                                                try {
                                                    m.init();
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
            var counter = {total: 0, loaded: 0};
            {% for script in current_app.javascripts %}{% if 'when' in script %}counter.total += 1; /* Not loading it now */
            {% if script.when %}counter.loaded += 1; /* Not loading it now */
            /* Registering '{{ script.path }}.js' to be loaded when a node '{{ script.when }}' is loaded */
            this.register_script('{{ script.when }}', '{{ script.name }}', '{{ script.path }}.js');{% else %}
            /* Loading {{ script.path }} */
            this.load_module('{{ script.name }}', '{{ script.path }}', counter);{% endif %}{% endif %}{% endfor %}

            var geneate_menus = function() {
                    if (counter.total == counter.loaded) {
                        {% set cnt = 1 %}
                        obj.add_menus([{% for key in ('File', 'Edit', 'Object' 'Tools', 'Management', 'Help') %}{% for item in current_app.menu_items['%s_items' % key.lower()] %}{% if cnt != 1 %}, {% endif %} {
                            name: "{{ item.name }}",
                            {% if item.module %}module: {{ item.module }},
                            {% endif %}{% if item.url %}url: "{{ item.url }}",
                            {% endif %}{% if item.target %}target: "{{ item.target }}",
                            {% endif %}{% if item.callback %}callback: "{{ item.callback }}",
                            {% endif %}label: '{{ item.label }}', applies: ['{{ key.lower() }}'],
                            priority: {{ item.priority }},
                            enable: '{{ item.enable }}'
                        }{% set cnt = cnt + 1 %}{% endfor %}{% set cnt = cnt + 1 %}{% endfor %}]);
                        obj.create_menus();
                    } else {
                        setTimeout(function() { geneate_menus(); }, 500);
                    }
            };
            geneate_menus();
        },
        load_module: function(name, path, c) {
            require([name],function(m) {
                try {
                    if (m.init && typeof(m.init) == 'function')
                        m.init();
                } catch (e) {
                }
                c.loaded += 1;
            }, function() {
                /* TODO:: proper error */
                console.log (arguments);
            });
        },
        add_menus: function(menus) {
            var pgMenu = this.menus;
            var MenuItem = pgAdmin.Browser.MenuItem;

            _.each(menus, function(m) {
                _.each(m.applies, function(a) {
                    /* We do support menu type only from this list */
                    if ($.inArray(a, [
                            'context', 'file', 'edit', 'object',
                            'management', 'tools', 'help']) >= 0) {
                        var menus;
                        pgMenu[a] = pgMenu[a] || {};
                        if (_.isString(m.node)) {
                            menus = pgMenu[a][m.node] = pgMenu[a][m.node] || {};
                        } else {
                            menus = pgMenu[a];
                        }

                        if (_.has(menus, m.name)) {
                            console.log(m.name +
                                ' has been ignored!\nIt is already exist in the ' +
                                a +
                                ' list of menus!');
                        } else {
                            menus[m.name] = new MenuItem({
                                name: m.name, label: m.label, module: m.module,
                                category: m.category, callback: m.callback,
                                priority: m.priority, data: m.data, url: m.url,
                                enable: m.enable == '' ? true : _.isString(m.enable) && m.enable.toLowerCase() == 'false' ? false : m.enable
                            });
                        }
                    } else  {
                        console && console.log &&
                            console.log(
                                "Developer warning: Category '" +
                                a +
                                "' is not supported!\nSupported categories are: context, file, edit, object, tools, management, help");
                    }
                });
            });
        },
        create_menus: function() {
            /* Create menus */
            var navbar = $('#navbar-menu > ul').first();
            var obj = this;

            _.each([
                    {menu: 'file', id: '#mnu_file'},
                    {menu: 'edit', id: '#mnu_edit'},
                    {menu: 'management', id: '#mnu_management'},
                    {menu: 'tools', id: '#mnu_tools'},
                    {menu: 'help', id:'#mnu_help'}], function(o) {
                        var j = navbar.children(o.id).children('.dropdown-menu').first().empty();
                        _.each(
                            _.sortBy(obj.menus[o.menu],
                                function(v, k) { return v.priority; }),
                            function(v) {
                                j.closest('.dropdown').removeClass('hide');
                                j.append(v.generate());
                            });
                    });
            navbar.children('#mnu_obj').removeClass('hide');
            this.enable_disable_menus();
        }
    });

    return pgAdmin.Browser;
});
