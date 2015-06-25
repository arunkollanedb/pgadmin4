define(
        ['jquery', 'underscore', 'underscore.string', 'pgadmin', 'pgadmin.browser.menu',
         'backbone', 'alertify', 'backform', 'pgadmin.backform', 'wcdocker'],
function($, _, S, pgAdmin, Menu, Backbone, Alertify, Backform) {

    var pgBrowser = pgAdmin.Browser = pgAdmin.Browser || {};
    var wcDocker = window.wcDocker;

    // It has already been defined.
    // Avoid running this script again.
    if (pgBrowser.Node)
        return pgBrowser.Node;

    pgBrowser.Nodes = pgBrowser.Nodes || {};

    // A helper (base) class for all the nodes, this has basic
    // operations/callbacks defined for basic operation.
    pgBrowser.Node = function() {};

    // Helper function to correctly set up the property chain, for subclasses.
    // Uses a hash of class properties to be extended.
    //
    // It is unlikely - we will instantiate an object for this class.
    // (Inspired by Backbone.extend function)
    pgBrowser.Node.extend = function(props) {
        var parent = this;
        var child;

        // The constructor function for the new subclass is defined to simply call
        // the parent's constructor.
        child = function(){ return parent.apply(this, arguments); };

        // Add static properties to the constructor function, if supplied.
        _.extend(child, parent, _.omit(props, 'callbacks'));

        // Make sure - a child have all the callbacks of the parent.
        child.callbacks = _.extend({}, parent.callbacks, props.callbacks);

        // Registering the node by calling child.Init(...) function
        child.Init.apply(child);

        // Initialize the parent
        this.Init.apply(child);

        return child;
    };

    // Defines - which control needs to be instantiated in different modes.
    // i.e. Node properties, create, edit, etc.
    var controlType = {
        'properties': {
            'int': 'uneditable-input',
            'text': 'uneditable-input',
            'numeric': 'uneditable-input',
            'date': 'date',
            'boolean': 'bool-text',
            'options': 'uneditable-input',
            'multiline': 'textarea'
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

    _.extend(pgAdmin.Browser.Node, {
        // Node type
        type: undefined,
        // Label
        label: '',
        title: function(d) {
            return d.label;
        },
        ///////
        // Initialization function
        // Generally - used to register the menus for this type of node.
        //
        // Also, look at pgAdmin.Browser.add_menus(...) function.
        //
        // NOTE: Override this for each node for initialization purpose
        Init: function() {
            if (this.node_initialized)
                return;
            this.node_initialized = true;

            pgAdmin.Browser.add_menus([{
                name: 'show_node_properties', node: this.type, module: this,
                applies: ['object', 'context'], callback: 'show_obj_properties',
                priority: 3, label: '{{ _("Properties...") }}'
            }]);
        },
        ///////
        // Generate a Backform view using the node's model type
        //
        // Used to generate view for the particular node properties, edit,
        // creation.
        getView: function(type, el, node, formType, callback) {

            if (!this.type || this.type == '' || !type in controlType)
                // We have no information, how to generate view for this type.
                return null;

            if (this.model) {
                // This will be the URL, used for object manipulation.
                // i.e. Create, Update in these cases
                var urlBase = this.generate_url(type, node);

                if (!urlBase)
                    // Ashamed of myself, I don't know how to manipulate this
                    // node.
                    return null;

                var opts = {};

                // In order to get the object data from the server, we must set
                // object-id in the model (except in the create mode).
                if (type !== 'create') {
                    opts[this.model.idAttribute || 'id'] = node._id;
                }

                // We know - which data model to be used for this object.
                var newModel = new (this.model.extend({urlRoot: urlBase}))(opts);

                // 'schema' has the information about how to generate the form.
                if (newModel.schema && _.isArray(newModel.schema)) {
                    var groups = {};

                    _.each(newModel.schema, function(f) {
                        // Do we understand - what control, we're creating
                        // here?
                        if (f && f.mode && _.isObject(f.mode) &&
                            _.indexOf(f.mode, type) != -1 &&
                            type in controlType) {
                            // Each field is kept in specified group, or in
                            // 'General' category.
                            var group = f.group || '{{ _("General") }}';

                            // Generate the empty group list (if not exists)
                            if (!groups[group]) {
                                groups[group] = [];
                            }

                            // Temporarily store in dictionaly format for
                            // utilizing it later.
                            groups[group].push({
                                name: f.id, label: f.label,
                                control: controlType[type][f.type],
                                // Do we need to show this control in this mode?
                                show: f.show && newModel[f.show] &&
                                    typeof newModel[f.show] == "function" ?
                                    newModel[f.show] : undefined,
                                // This can be disabled in some cases (if not hidden)
                                disable: f.disable && newModel[f.disable] &&
                                    typeof newModel[f.disable] == "function" ?
                                    newModel[f.disable] : undefined,
                                options: f.options
                            });
                        }
                    });

                    // Do we have fields to genreate controls, which we
                    // understand?
                    if (_.isEmpty(groups)) {
                        return null;
                    }

                    var fields = [];
                    // This will contain the actual view
                    var view;

                    // Create an array from the dictionary with proper required
                    // structure.
                    _.each(groups, function(val, key) {
                        fields.push({label: key, fields: val});
                    });

                    if (formType == 'fieldset') {
                        // It is used to show, edit, create the object in the
                        // properties tab.
                        view = new Backform.Fieldset({
                            el: el, model: newModel, schema: fields
                        });
                    } else {
                        // This generates a view to be used by the node dialog
                        // (for create/edit operation).
                        view = new Backform.Dialog({
                            el: el, model: newModel, schema: fields
                        });
                    }

                    if (!newModel.isNew()) {
                        // This is definetely not in create mode
                        newModel.fetch()
                            .success(function(res, msg, xhr) {
                                if (res) {
                                    // We got the latest attributes of the
                                    // object. Render the view now.
                                    view.render();
                                    if (typeof(callback) != "undefined") {
                                        callback(view);
                                    }
                                }
                            })
                            .error(function() {
                                // TODO:: Handle the error message properly.
                            });
                    } else {
                        // Yay - render the view now!
                        view.render();
                        if (typeof(callback) != "undefined") {
                            callback(view);
                        }
                    }
                }

                return view;
            }

            return null;
        },
        register_node_panel: function() {
            var w = pgBrowser.docker,
                p = w.findPanels('node_props');

            if (p && p.length == 1)
                return;

            p = new pgBrowser.Panel({
                    name: 'node_props',
                    showTitle: true,
                    isCloseable: true,
                    isPrivate: false,
                    content: '<div class="obj_properties">No object selected!</div>'
                });
            p.load(pgBrowser.docker);
        },
        // List of common callbacks - that can be used for different
        // operations!
        callbacks: {
            // Create a object of this type
            create_obj: function(item) {
                var t = pgBrowser.tree,
                    i = item || t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined;

                // If we've parent, we will get the information of it for
                // proper object manipulation.
                //
                // You know - we're working with RDBMS, relation is everything
                // for us.
                if (this.parent_type && this.parent_type != d._type) {
                    // In browser tree, I can be under any node, But - that
                    // does not mean, it is my parent.
                    //
                    // We have some group nodes too.
                    //
                    // i.e.
                    // Tables, Views, etc. nodes under Schema node
                    //
                    // And, actual parent of a table is schema, not Tables.
                    while (i && t.hasParent(i)) {
                        i = t.parent(i);
                        pd = t.itemData(i);

                        if (this.parent_type == pd._type) {
                            // Assign the data, this is my actual parent.
                            d = pd;
                            break;
                        }
                    }
                }

                // Seriously - I really don't have parent data present?
                //
                // The only node - which I know - who does not have parent
                // node, is the Server Group (and, comes directly under root
                // node - which has no data.)
                if (!d || (d._type != this.parent_type && this.parent_type != null)) {
                    // It should never come here.
                    // If it is here, that means - we do have some bug in code.
                    return;
                }

                if (!d)
                    return;

                // Make sure - the properties dialog open
                pgBrowser.Node.register_node_panel();

                p = pgBrowser.docker.addPanel('node_props', wcDocker.DOCK_FLOAT,
                        pgBrowser.panels['properties'].panel);

                p.title(S('{{ _("Create - %%s") }}').sprintf([
                            this.label]).value());
                p.icon('icon-' + this.type);

                // Make sure the properties dialog is visible
                p.focus();

                var that = this,
                    j = p.$container.find('.obj_properties').first(),
                    // In order to release the memory allocated to the view, we need
                    // to keep the view object in this panel.
                    view = j.data('obj-view'),
                    // This is where, we will keep the properties
                    // fieldsets.
                    content = $('<div></div>').addClass('has-pg-prop-btn-group pg-prop-content col-xs-12'),
                    // Template function to create the buttons-set.
                    createButtons = function(buttons) {
                        // arguments must be non-zero length array of type
                        // object, which contains following attributes:
                        // label, type, extraClasses, register
                        if (buttons && _.isArray(buttons) && buttons.length > 0) {
                            // All buttons will be created within a single
                            // div area.
                            var btnGroup =
                                $('<div></div>').addClass(
                                    'pg-prop-btn-group col-xs-12'
                                    ).appendTo(j),
                                // Template used for creating a button
                                tmpl = _.template([
                                    '<button type="<%=type%>"',
                                    'class="btn <%=extraClasses.join(\' \')%>"',
                                    '><%-label%></button>'
                                    ].join(' '));
                            _.each(buttons, function(btn) {
                                // Create the actual button, and append to
                                // the group div
                                var b = $(tmpl(btn));
                                btnGroup.append(b);
                                // Register is a callback to set callback
                                // for certain operatio for this button.
                                btn.register(b);
                            });
                            return btnGroup;
                        }
                        return null;
                    },
                    // Function to create the object of this type
                    createFunc = function() {
                        // We need to release any existing view, before
                        // creating new view.
                        if (view) {
                            // Release the view
                            view.remove();
                            // Deallocate the view
                            delete view;
                            view = null;
                            // Reset the data object
                            j.data('obj-view', null);
                        }
                        // Make sure - nothing is displayed now
                        j.empty();
                        // Generate a view for creating the node in
                        // properties tab.
                        view = that.getView('create', content, d, 'fieldset');

                        // Did we get success to generate the view?
                        if (view) {
                            // Save it to release it later.
                            j.data('obj-view', view);

                            // Create the buttons now.
                            createButtons([{
                                label: '{{ _('Save') }}', type: 'save',
                                extraClasses: ['btn-primary'],
                                register: function(btn) {
                                    // Create a new node on clicking this
                                    // button
                                    btn.click(function() {
                                        var m = view.model;
                                        if (m.changed &&
                                            !_.isEmpty(m.changed)) {
                                            // Create the object by calling
                                            // model.save()
                                            m.save({} ,{
                                                success: function(model, response) {
                                                    /* TODO:: Add this node to the tree */
                                                    alert('{{ _('Show this object in the browser tree and select it!') }} ');
                                                },
                                                error: function() {
                                                    /* TODO:: Alert for the user on error */
                                                    console.log('{{ _('ERROR:') }}');
                                                    console.log(arguments);
                                                }
                                                });
                                        }
                                    });
                                }
                            },{
                                label: '{{ _('Cancel') }}', type: 'cancel',
                                extraClasses: ['btn-danger'],
                                register: function(btn) {
                                    btn.click(function() {
                                        /* TODO:: Show properties of the current selected object */
                                        alert('{{ _('show properties of selected node') }}');
                                    });
                                }
                            },{
                                label: '{{ _('Reset') }}', type: 'reset',
                                extraClasses: ['btn-warning'],
                                register: function(btn) {
                                    btn.click(function() {
                                        // Reset the content
                                        setTimeout(function() { createFunc(); }, 100);
                                    });
                                }
                            }])
                        }
                        j.append(content);
                    };

                // Call the createFunc(...) by default to open the create
                // node fieldset in new node_props tab.
                createFunc();
            },
            // Create the node in the alertify dialog
            create_obj_dlg: function(item) {
                var t = pgBrowser.tree,
                    i = item || t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined;

                // If we've parent, we will get the information of it for
                // proper object manipulation.
                //
                // You know - we're working with RDBMS, relation is everything
                // for us.
                if (this.parent_type && this.parent_type != d._type) {
                    // In browser tree, I can be under any node, But - that
                    // does not mean, it is my parent.
                    //
                    // We have some group nodes too.
                    //
                    // i.e.
                    // Tables, Views, etc. nodes under Schema node
                    //
                    // And, actual parent of a table is schema, not Tables.
                    while (i && t.hasParent(i)) {
                        i = t.parent(i);
                        pd = t.itemData(i);

                        if (this.parent_type == pd._type) {
                            // Assign the data, this is my actual parent.
                            d = pd;
                            break;
                        }
                    }
                }

                // Seriously - I really don't have parent data present?
                //
                // The only node - which I know - who does not have parent
                // node, is the Server Group (and, comes directly under root
                // node - which has no data.)
                if (!d || (d._type != this.parent_type && this.parent_type != null)) {
                    // It should never come here.
                    // If it is here, that means - we do have some bug in code.
                    return;
                }

                if (!d)
                    return;

                var that = this,
                    content = $('<div></div>').addClass('has-pg-prop-btn-group pg-prop-content col-xs-12'),
                    cb = function(v) {
                        // Create the dialog
                        Alertify.dlgNode || Alertify.dialog('dlgNode',
                            function factory() {
                                return {
                                    main: function(title, message, data) {
                                        this.set('title', title);
                                        this.message = message;
                                    },
                                    setup: function() {
                                        return {
                                            buttons:[
                                                { text: "{{ _('OK') }}", key: 13, className: "btn btn-primary"},
                                                { text: "{{ _('Cancel') }}", key: 27, className: "btn btn-danger"}],
                                            options: { modal: 0, title: this.title, resizeable: 0 }
                                        };
                                    },
                                    prepare: function() {
                                        this.setContent(this.message);
                                    },
                                    callback: function(ev) {
                                        console.log(ev);
                                    }
                                };
                            }, true);
                        dlg = Alertify.dlgNode(S('{{ _("Create %%s") }}').sprintf(that.label), content[0]);

                        // TODO:: Fetch height, width for each dialog
                        // content is not loaded in the document, hence - it does not
                        // give reliable values for width, height
                        dlg.resizeTo(350, 550);
                    },
                    view = that.getView('create', content, d, 'tab', cb);
            },
            show_obj_properties: function() {
                var t = pgBrowser.tree,
                    i = t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined
                    o = this;

                // Make sure - the node_props panel type registered
                pgBrowser.Node.register_node_panel();

                if (pgBrowser.Node.panels && pgBrowser.Node.panels[d.id] &&
                        pgBrowser.Node.panels[d.id].$container) {
                    p = pgBrowser.Node.panels[d.id];
                } else {
                    p = pgBrowser.docker.addPanel('node_props', wcDocker.DOCK_FLOAT,
                            pgBrowser.panels['properties'].panel);
                    p.title(o.title(d));
                    p.icon('icon-' + this.type);
                    pgBrowser.Node.panels = pgBrowser.Node.panels || {};
                    pgBrowser.Node.panels[d.id] = p;
                    o.showProperties(t, i, d,
                        p.$container.find('.obj_properties').first());
                }
                p.focus();
            },
            // Delete the selected object
            delete_obj: function() {
                var obj = this,
                    t = pgBrowser.tree,
                    i = t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined;

                if (!d)
                    return;

                Alertify.confirm(
                    S('{{ _('Drop %%s?') }}').sprintf(obj.label).value(),
                    S('{{ _('Are you sure you wish to drop the %%s - "%%s"?') }}')
                        .sprintf(obj.label, d.label).value(),
                        function() {
                            $.ajax({
                                url: obj.generate_url('drop', d, true),
                                type:'DELETE',
                                success: function(res) {
                                    if (res.success == 0) {
                                        report_error(res.errormsg, res.info);
                                    } else {
                                        var n = t.next(i);
                                        if (!n || !n.length)
                                            n = t.prev(i);
                                        t.remove(i);
                                        if (n.length) {
                                            t.select(n);
                                        }
                                    }
                                },
                                error: function(jqx) {
                                    var msg = jqx.responseText;
                                    /* Error from the server */
                                    if (jqx.status == 410) {
                                        try {
                                            var data = $.parseJSON(
                                                    jqx.responseText);
                                            msg = data.errormsg;
                                        } catch (e) {}
                                    }
                                    pgBrowser.report_error(
                                            S('{{ _('Error droping the %%s - "%%s"') }}')
                                                .sprintf(obj.label, d.label)
                                                    .value(), msg);
                                }
                            });
                        },
                        null).show()
            },
            // Edit the object properties
            edit_obj: function() {
                var t = pgBrowser.tree,
                    i = t.selected(),
                    d = i && i.length == 1 ? t.itemData(i) : undefined;

                if (!d)
                    return;

                // Make sure - the properties dialog open
                pgBrowser.Node.register_node_panel();

                p = pgBrowser.docker.addPanel('node_props',
                        wcDocker.DOCK_FLOAT);
                p.title(S('%s - %s').sprintf(this.label, d.label).value());
                p.icon('icon-' + this.type);

                // Make sure the properties dialog is visible
                p.focus();

                var that = this,
                    j = p.$container.find('.obj_properties').first(),
                    // In order to release the memory allocated to the view, we need
                    // to keep the view object in this panel.
                    view = j.data('obj-view'),
                    // This is where, we will keep the properties
                    // fieldsets.
                    content = $('<div></div>').addClass('has-pg-prop-btn-group pg-prop-content col-xs-12'),
                    // Template function to create the buttons-set.
                    createButtons = function(buttons) {
                        // arguments must be non-zero length array of type
                        // object, which contains following attributes:
                        // label, type, extraClasses, register
                        if (buttons && _.isArray(buttons) && buttons.length > 0) {
                            // All buttons will be created within a single
                            // div area.
                            var btnGroup =
                                $('<div></div>').addClass(
                                    'pg-prop-btn-group col-xs-12'
                                    ).appendTo(j),
                                // Template used for creating a button
                                tmpl = _.template([
                                    '<button type="<%=type%>"',
                                    'class="btn <%=extraClasses.join(\' \')%>"',
                                    '><%-label%></button>'
                                    ].join(' '));
                            _.each(buttons, function(btn) {
                                // Create the actual button, and append to
                                // the group div
                                var b = $(tmpl(btn));
                                if (btn.title && btn.title != '')
                                    b.attr('title', btn.title);
                                btnGroup.append(b);
                                // Register is a callback to set callback
                                // for certain operatio for this button.
                                btn.register(b);
                            });
                            return btnGroup;
                        }
                        return null;
                    },
                    // Function to create the object of this type
                    editFunc = function() {
                        // We need to release any existing view, before
                        // creating new view.
                        if (view) {
                            // Release the view
                            view.remove();
                            // Deallocate the view
                            delete view;
                            view = null;
                            // Reset the data object
                            j.data('obj-view', null);
                        }
                        // Make sure - nothing is displayed now
                        j.empty();
                        // Generate a view for creating the node in
                        // properties tab.
                        view = that.getView('edit', content, d, 'fieldset');

                        // Did we get success to generate the view?
                        if (view) {
                            // Save it to release it later.
                            j.data('obj-view', view);

                            // Create the buttons now.
                            createButtons([{
                                label: '{{ _('Save') }}', type: 'save',
                                title: 'Save and close the panel',
                                extraClasses: ['btn-primary'],
                                register: function(btn) {
                                    // Create a new node on clicking this
                                    // button
                                    btn.click(function() {
                                        var m = view.model;
                                        if (m.changed &&
                                            !_.isEmpty(m.changed)) {
                                            // Create the object by calling
                                            // model.save()
                                            m.save({} ,{
                                                success: function(model, response) {
                                                    /* TODO:: Add this node to the tree */
                                                    alert('{{ _('Show this object in the browser tree and select it!') }} ');
                                                },
                                                error: function() {
                                                    /* TODO:: Alert for the user on error */
                                                    console.log('{{ _('ERROR:') }}');
                                                    console.log(arguments);
                                                }
                                                });
                                        }
                                    });
                                }
                            },{
                                label: '{{ _('Cancel') }}', type: 'cancel',
                                extraClasses: ['btn-danger'],
                                register: function(btn) {
                                    btn.click(function() {
                                        /* TODO:: Show properties of the current selected object */
                                        alert('{{ _('show properties of selected node') }}');
                                    });
                                }
                            },{
                                label: '{{ _('Reset') }}', type: 'reset',
                                extraClasses: ['btn-warning'],
                                register: function(btn) {
                                    btn.click(function() {
                                        // Reset the content
                                        setTimeout(function() { editFunc(); }, 100);
                                    });
                                }
                            }])
                        }
                        j.append(content);
                    };

                // Call the editFunc(...) by default to open the create
                // node fieldset in new node_props tab.
                editFunc();
            },
            // Callback called - when a node is selected in browser tree.
            selected: function(o) {
                // Show (One of these, whose panel is open)
                // + Properties
                // + Query
                // + Dependents
                // + Dependencies
                // + Statistics

                // Update the menu items
                pgAdmin.Browser.enable_disable_menus.apply(o.browser, [o.item]);

                if (o && o.data && o.browser) {
                    if ('properties' in o.browser.panels &&
                            o.browser.panels['properties'] &&
                            o.browser.panels['properties'].panel &&
                            o.browser.panels['properties'].panel.isVisible()) {
                        // Show object properties (only when the 'properties' tab
                        // is active).
                        this.showProperties(o.browser.tree, o.item, o.data,
                                pgBrowser.panels['properties'].panel
                                .$container.find('.obj_properties').first());
                    } else if ('sql' in o.browser.panels &&
                            o.browser.panels['sql'] &&
                            o.browser.panels['sql'].panel &&
                            o.browser.panels['sql'].panel.isVisible()) {
                        // Show reverse engineered query for this object (when
                        // the 'sql' tab is active.)
                    } else if ('statistics' in o.browser.panels &&
                            o.browser.panels['statistics'] &&
                            o.browser.panels['statistics'].panel &&
                            o.browser.panels['statistics'].panel.isVisible()) {
                        // Show statistics for this object (when the
                        // 'statistics' tab is active.)
                    } else if ('dependencies' in o.browser.panels &&
                            o.browser.panels['dependencies'] &&
                            o.browser.panels['dependencies'].panel &&
                            o.browser.panels['dependencies'].panel.isVisible()) {
                        // Show dependencies for this object (when the
                        // 'dependencies' tab is active.)
                    } else if ('dependents' in o.browser.panels &&
                            o.browser.panels['dependents'] &&
                            o.browser.panels['dependents'].panel &&
                            o.browser.panels['dependents'].panel.isVisible()) {
                        // Show dependents for this object (when the
                        // 'dependents' tab is active.)
                    }
                }
            }
        },
        // A hook (not a callback) to show object properties in given HTML
        // element.
        showProperties: function(tree, item, node, j) {
            var that = this,
                view = j.data('obj-view'),
                content = $('<div></div>').addClass('has-pg-prop-btn-group pg-prop-content col-xs-12'),
                // Template function to create the buttons-set.
                createButtons = function(buttons) {
                    // arguments must be non-zero length array of type
                    // object, which contains following attributes:
                    // label, type, extraClasses, register
                    if (buttons && _.isArray(buttons) && buttons.length > 0) {
                        // All buttons will be created within a single
                        // div area.
                        var btnGroup =
                            $('<div></div>').addClass(
                                'pg-prop-btn-group col-xs-12'
                                ).appendTo(j),
                            // Template used for creating a button
                            tmpl = _.template([
                                '<button type="<%=type%>"',
                                'class="btn <%=extraClasses.join(\' \')%>"',
                                '><%-label%></button>'
                                ].join(' '));
                        _.each(buttons, function(btn) {
                            // Create the actual button, and append to
                            // the group div
                            var b = $(tmpl(btn));
                            btnGroup.append(b);
                            // Register is a callback to set callback
                            // for certain operatio for this button.
                            btn.register(b);
                        });
                        return btnGroup;
                    }
                    return null;
                },
                // Callback to show object properties
                properties = function() {
                    // We need to release any existing view, before
                    // creating new view.
                    if (view) {
                        // Release the view
                        view.remove();
                        // Deallocate the view
                        delete view;
                        view = null;
                        // Reset the data object
                        j.data('obj-view', null);
                    }
                    // Make sure the HTML element is empty.
                    j.empty();
                    // Create a view to show the properties in fieldsets
                    view = that.getView('properties', content, node, 'fieldset');
                    if (view) {
                        // Save it for release it later
                        j.data('obj-view', view);
                        // Create proper buttons
                        createButtons([{
                            label: '{{ _("Edit") }}', type: 'edit',
                            extraClasses: ['btn-primary'],
                            register: function(btn) {
                                btn.click(function() {
                                    // editFunc();
                                    that.callbacks.edit_obj.apply(that);
                                });
                            }
                        }]);
                    }
                    j.append(content);
                },
                editFunc = function() {
                    // We need to release any existing view, before
                    // creating the new view.
                    if (view) {
                        // Release the view
                        view.remove();
                        // Deallocate the view
                        delete view;
                        view = null;
                        // Reset the data object
                        j.data('obj-view', null);
                    }
                    // Make sure the HTML element is empty.
                    j.empty();
                    // Create a view to edit the properties in fieldsets
                    view = that.getView('edit', content, node, 'fieldset');
                    if (view) {
                        // Save it to release it later
                        j.data('obj-view', view);
                        // Create proper buttons
                        createButtons([{
                            label: '{{ _("Save") }}', type: 'save',
                            extraClasses: ['btn-primary'],
                            register: function(btn) {
                                // Save the changes
                                btn.click(function() {
                                    var m = view.model;
                                    if (m.changed &&
                                        !_.isEmpty(m.changed)) {
                                        m.save({} ,{
                                            attrs: m.changedAttributes(),
                                            success: function(model, response) {
                                                // Switch back to show
                                                // properties mode.
                                                properties();
                                                // Update the item lable (if
                                                // lable is modified.)
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
                            label: '{{ _('Cancel') }}', type: 'cancel',
                            extraClasses: ['btn-danger'],
                            register: function(btn) {
                                btn.click(function() {
                                    properties();
                                });
                            }
                        },{
                            label: '{{ _("Reset") }}', type: 'reset',
                            extraClasses: ['btn-warning'],
                            register: function(btn) {
                                btn.click(function() {
                                    setTimeout(function() { editFunc(); }, 100);
                                });
                            }
                        }]);
                    }
                    // Show contents after buttons
                    j.append(content);
                };

            /* Show properties */
            properties();
        },
        // What am I refering to (parent or me)?
        reference: function(d, with_id) {
            if (d._type == this.type) {
                var res = '';
                if (d.refid)
                    res = S('/%s').sprintf(d.refid).value();
                if (with_id)
                    res = S('%s/%s').sprintf(res, d._id).value();
                return res;
            }
            return S('/%s/').sprintf(d._id);
        },
        // Generate the URL for different purposes
        generate_url: function(type, data, with_id) {
            var url = pgAdmin.Browser.URL + '{TYPE}/{REDIRECT}{REF}';
            var args = { 'TYPE': this.type, 'REDIRECT': '',
                'REF': this.reference(data, with_id) };

            switch(type) {
                case 'create':
                    if (!this.parent_type) {
                        args.REF = '/';
                    }
                case 'drop':
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
        },
        // Base class for Node Model
        Model: Backbone.Model
    });

    return pgAdmin.Browser.Node;
});
