define(
        ['jquery', 'underscore', 'pgadmin', 'pgadmin.browser.menu',
         'backbone', 'backform', 'pgadmin.backform'],
function($, _, pgAdmin, Menu, Backbone, Backform) {

    var pgBrowser = pgAdmin.Browser = pgAdmin.Browser || {};
    var nodes = pgBrowser.Nodes;

    if (nodes)
        return nodes;

    pgBrowser.Nodes = pgBrowser.Nodes || {};

    var nodeOpts = ['type', 'label', 'Init', 'model', 'parent_type'];

    pgAdmin.Browser.Node = function(opts) {
        opts || (opts = {});
        _.extend(this, _.pick(opts, nodeOpts));
        this.callbacks = _.extend({}, this.callbacks, opts.callbacks);
        this.Init.apply(this);
    };
    pgAdmin.Browser.Node.extend = Backbone.Model.extend;

    var controlType = {
        'properties': {
            'int': 'uneditable-input',
            'text': 'uneditable-input',
            'numeric': 'uneditable-input',
            'date': 'date',
            'boolean': 'bool-text',
            'options': 'uneditable-input',
            'multiline': 'textarea',
            'spacer': 'spacer'
        },
        'edit': {
            'int': 'input',
            'text': 'input',
            'numeric': 'input',
            'date': 'date',
            'boolean': 'boolean',
            'options': 'select',
            'multiline': 'textarea'
        },
        'create': {
            'int': 'input',
            'text': 'input',
            'numeric': 'input',
            'date': 'date',
            'boolean': 'boolean',
            'options': 'select',
            'multiline': 'textarea'
        }
    };

    _.extend(pgAdmin.Browser.Node.prototype, {
        type: undefined,
        label: '',
        Init: function() { /* Override for initialization purpose */ },
        getView: function(type, el, node, formType) {

            if (!this.type || this.type == '' || !type in controlType)
                return null;

            if (this.model) {
                var urlBase = this.generate_url(type, node);

                if (!urlBase)
                    return null;

                var opts = {};
                if (type !== 'create') {
                    opts[this.model.idAttribute || 'id'] = node._id;
                }

                var newModel = new (this.model.extend({urlRoot: urlBase}))(opts);

                if (newModel.schema && _.isArray(newModel.schema)) {
                    var groups = {};
                    _.each(newModel.schema, function(f) {
                        if (f && f.mode && _.isObject(f.mode) &&
                            _.indexOf(f.mode, type) != -1 &&
                            type in controlType) {
                            var group = f.group || "General";

                            /* Generate the group list */
                            if (!groups[group]) {
                                groups[group] = [];
                            }
                            groups[group].push({
                                name: f.id, label: f.label,
                                control: controlType[type][f.type],
                                show: f.show && newModel[f.show] &&
                                    typeof newModel[f.show] == "function" ?
                                    newModel[f.show] : undefined,
                                disable: f.disable && newModel[f.disable] &&
                                    typeof newModel[f.disable] == "function" ?
                                    newModel[f.disable] : undefined,
                                options: f.options
                            });
                        }
                    });
                    if (_.isEmpty(groups)) {
                        return null;
                    }

                    var fields = [];
                    var view;

                    _.each(groups, function(val, key) {
                        fields.push({label: key, fields: val});
                    });
                    if (formType == 'fieldset') {
                        view = new Backform.Fieldset({
                            el: el, model: newModel, schema: fields
                        });
                    } else {
                        view = new Backform.Dialog({
                            el: el, model: newModel, schema: fields
                        });
                    }

                    if (type !== 'create') {
                        newModel.fetch()
                            .success(function(res, msg, xhr) {
                                if (res) {
                                    view.render();
                                }
                            })
                            .error(function() {
                            });
                    } else {
                        view.render();
                    }
                }
                this.view = view;

                return view;
            }

            return null;
        },
        callbacks: {
            create_obj: function(item) {
                var t = pgBrowser.tree,
                    i = item || t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined;

                if (this.parent_type && this.parent_type != d._type) {
                    while (i && t.hasParent(i)) {
                        i = t.parent(i);
                        d = t.itemData(i);

                        if (d.parent_type == d._type) {
                            break;
                        }
                    }
                }

                if (!d || (d._type != this.parent_type && this.parent_type != null)) {
                    return;
                }

                if (!d)
                    return;

                if ('properties' in pgBrowser.panels &&
                    pgBrowser.panels['properties'] &&
                    pgBrowser.panels['properties'].panel) {
                    var p = pgBrowser.panels['properties'].panel;
                    /* Make sure the properties dialog is visible */
                    p.focus();

                    /* START */
                    var that = this,
                        j = $('#obj_props'),
                        view = j.data('obj-view'),
                        content = $('<div></div>').addClass('pg-prop-content'),
                        createButtons = function(buttons) {
                            if (buttons && _.isArray(buttons) && buttons.length > 0) {
                                var btnGroup =
                                    $('<div></div>').addClass(
                                        'pg-prop-btn-group col-lg-8 col-sm-10 col-md-8 col-xs-12'
                                        ).appendTo(j),
                                    tmpl = _.template([
                                        '<button type="<%=type%>"',
                                        'class="btn <%=extraClasses.join(\' \')%>"',
                                        '><%-label%></button>'
                                        ].join(' '));
                                    _.each(buttons, function(btn) {
                                        btnGroup.append(tmpl(btn));
                                        btn.register();
                                    });
                                return btnGroup;
                            }
                            return null;
                        },
                        createFunc = function() {
                            if (view) {
                                view.close();
                                delete view;
                                view = null;
                                j.data('obj-view', null);
                            }
                            j.empty();
                            that.getView('create', content, d, 'fieldset');
                            if (that.view) {
                                view = that.view;
                                j.data('obj-view', view);
                                createButtons([{
                                    label: 'Save', type: 'save',
                                    extraClasses: ['btn-primary'],
                                    register: function() {
                                        j.find('[type="save"]').click(function() {
                                            var m = that.view.model;
                                            if (m.changed &&
                                                !_.isEmpty(m.changed)) {
                                                m.save({} ,{
                                                    success: function(model, response) {
                                                        /* Add this node to the tree */
                                                        alert('Show this object in the browser tree and select it!');
                                                    },
                                                    error: function() {
                                                        /* TODO:: Alert for the user on error */
                                                        console.log('ERROR:');
                                                        console.log(arguments);
                                                    }
                                                    });
                                            }
                                        });
                                    }
                                },{
                                    label: 'Cancel', type: 'cancel',
                                    extraClasses: ['btn-danger'],
                                    register: function() {
                                        j.find('[type="cancel"]').click(function() {
                                            /* TODO:: Show properties of the current selected object */
                                            alert('show properties of selected node');
                                        });
                                    }
                                },{
                                    label: 'Reset', type: 'reset',
                                    extraClasses: ['btn-warning'],
                                    register: function() {
                                        j.find('[type="reset"]').click(function() {
                                            setTimeout(function() { createFunc(); }, 100);
                                        });
                                    }
                                }])
                            }
                            j.prepend(content);
                        };

                    createFunc();
                }
            },
            delete_obj: function() {
                console.log(arguments);
            },
            rename_obj: function() {
                console.log(arguments);
            },
            selected: function(o) {
                // Show (One of these, whose panel is open)
                // + Properties
                // + Query
                // + Dependents
                // + Dependencies
                // + Statistics
                pgAdmin.Browser.enable_disable_menus.apply(o.browser, [o.item]);
                if (o && o.data && o.browser) {
                    if ('properties' in o.browser.panels &&
                            o.browser.panels['properties'] &&
                            o.browser.panels['properties'].panel &&
                            o.browser.panels['properties'].panel.isVisible()) {
                        this.showProperties(o.browser.tree, o.item, o.data, '#obj_props');
                    } else if ('sql' in o.browser.panels &&
                            o.browser.panels['sql'] &&
                            o.browser.panels['sql'].panel &&
                            o.browser.panels['sql'].panel.isVisible()) {
                        // TODO:: Show SQL for this node
                    } else if ('statistics' in o.browser.panels &&
                            o.browser.panels['statistics'] &&
                            o.browser.panels['statistics'].panel &&
                            o.browser.panels['statistics'].panel.isVisible()) {
                        // TODO:: Show statistics for this node
                    } else if ('dependencies' in o.browser.panels &&
                            o.browser.panels['dependencies'] &&
                            o.browser.panels['dependencies'].panel &&
                            o.browser.panels['dependencies'].panel.isVisible()) {
                        // TODO:: Show dependencies for this node
                    } else if ('dependents' in o.browser.panels &&
                            o.browser.panels['dependents'] &&
                            o.browser.panels['dependents'].panel &&
                            o.browser.panels['dependents'].panel.isVisible()) {
                        // TODO:: Show dependents for this node
                    }
                }
            }
        },
        showProperties: function(tree, item, node, el) {
            var that = this,
                j = $(el),
                view = j.data('obj-view'),
                content = $('<div></div>').addClass('pg-prop-content'),
                createButtons = function(buttons) {
                    if (buttons && _.isArray(buttons) && buttons.length > 0) {
                        var btnGroup =
                            $('<div></div>').addClass(
                                'pg-prop-btn-group col-lg-8 col-sm-10 col-md-8 col-xs-12'
                                ).appendTo(j),
                            tmpl = _.template([
                                    '<button type="<%=type%>"',
                                    'class="btn <%=extraClasses.join(\' \')%>"',
                                    '><%-label%></button>'
                                    ].join(' '));
                        _.each(buttons, function(btn) {
                            btnGroup.append(tmpl(btn));
                            btn.register();
                        });
                        return btnGroup;
                    }
                    return null;
                },
                properties = function() {
                    if (view) {
                        view.close();
                        delete view;
                        view = null;
                        j.data('obj-view', null);
                    }
                    j.empty();
                    that.getView('properties', content, node, 'fieldset');
                    if (that.view) {
                        view = that.view;
                        j.data('obj-view', view);
                        createButtons([{
                            label: 'Edit', type: 'edit',
                            extraClasses: ['btn-primary'],
                            register: function() {
                                j.find('[type="edit"]').click(function() {
                                    editFunc();
                                });
                            }
                        }]);
                    }
                    j.append(content);
                },
                editFunc = function() {
                    if (view) {
                        view.close();
                        delete view;
                        view = null;
                        j.data('obj-view', null);
                    }

                    j.empty();
                    that.getView('edit', content, node, 'fieldset');
                    if (that.view) {
                        view = that.view;
                        j.data('obj-view', view);
                        createButtons([{
                            label: 'Save', type: 'save',
                            extraClasses: ['btn-primary'],
                            register: function() {
                                j.find('[type="save"]').click(function() {
                                    var m = that.view.model;
                                    if (m.changed &&
                                        !_.isEmpty(m.changed)) {
                                        m.save({} ,{
                                            attrs: m.changedAttributes(),
                                            success: function(model, response) {
                                                properties();
                                                tree.setLabel(item, {label: m.get("name")});
                                            },
                                            error: function() {
                                                /* TODO:: Alert for the user on error */
                                                console.log('ERROR:');
                                                console.log(arguments);
                                            }
                                        });
                                    }
                                });
                            }
                        },{
                            label: 'Cancel', type: 'cancel',
                            extraClasses: ['btn-danger'],
                            register: function() {
                                j.find('[type="cancel"]').click(function() {
                                    properties();
                                });
                            }
                        },{
                            label: 'Reset', type: 'reset',
                            extraClasses: ['btn-warning'],
                            register: function() {
                                j.find('[type="reset"]').click(function() {
                                    setTimeout(function() { editFunc(); }, 100);
                                });
                            }
                        }]);
                    }
                    j.prepend(content);
                };

            /* Show properties */
            properties();
        },
        addmenus: function(menus) {
            var that = this;
            var pgMenu = pgAdmin.Browser.menus;
            var MenuItem = pgAdmin.Browser.MenuItem;

            _.each(menus, function(m) {
                _.each(m.applies, function(a) {
                    pgMenu[a] = pgMenu[a] || {};
                    var menus = pgMenu[a][m.type] = pgMenu[a][m.type] || [];

                    menus.push(new pgAdmin.Browser.MenuItem({
                        module: m.module || that, label: m.label,
                        priority: m.priority, data: m.data,
                        callback: m.callback, category: m.category
                        }));
                });
            });
        },
        reference: function(d) {
            return (d._type == this.type ? (d.refid ? '/' + d.refid : '') : ( '/' + d._id + '/'));
        },
        generate_url: function(type, data) {
            var url = pgAdmin.Browser.URL + '{TYPE}/{REDIRECT}{REF}';
            var args = { 'TYPE': this.type, 'REDIRECT': '',
                'REF': this.reference(data) };

            switch(type) {
                case 'create':
                    if (!this.parent_type) {
                        args.REF = '/';
                    }
                case 'properties':
                case 'edit':
                    args.REDIRECT = 'obj';
                    break;
                case 'sql':
                    args.REDIRECT = 'sql';
                    break;
                case 'depends':
                    args.REDIRECT = 'deps';
                    break;
                case 'statistics':
                    args.REDIRECT = 'stats';
                    break;
                default:
                    return null;
            }

            return url.replace(/{(\w+)}/g, function(match, arg) {
                return args[arg];
            });
        }
    });

    pgAdmin.Browser.Node.Model = Backbone.Model.extend({});

    return pgAdmin.Browser.Node;
});
