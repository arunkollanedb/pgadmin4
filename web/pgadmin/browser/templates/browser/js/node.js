define(
        ['jquery', 'underscore', 'pgadmin', 'pgadmin.browser.menu',
         'backbone', 'backform', 'pgadmin.backform', 'alertify'],
function($, _, pgAdmin, Menu, Backbone, Backform, Alertify) {

    var pgBrowser = pgAdmin.Browser = pgAdmin.Browser || {};

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
        ///////
        // Initialization function
        // Generally - used to register the menus for this type of node.
        //
        // Also, look at pgAdmin.Browser.add_menus(...) function.
        Init: function() { /* Override for initialization purpose */ },
        ///////
        // Generate a Backform view using the node's model type
        //
        // Used to generate view for the particular node properties, edit,
        // creation.
        getView: function(type, el, node, formType) {

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
                            var group = f.group || "{{ _('General') }}";

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
                                }
                            })
                            .error(function() {
                                // TODO:: Handle the error message properly.
                            });
                    } else {
                        // Yay - render the view now!
                        view.render();
                    }
                }

                return view;
            }

            return null;
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

                        if (d.parent_type == pd._type) {
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

                if ('properties' in pgBrowser.panels &&
                    pgBrowser.panels['properties'] &&
                    pgBrowser.panels['properties'].panel) {

                    var p = pgBrowser.panels['properties'].panel;
                    // Make sure the properties dialog is visible
                    p.focus();

                    var that = this,
                        j = $('#obj_props'),
                        // In order to release the memory allocated to the view, we need
                        // to keep the view object in this panel.
                        view = j.data('obj-view'),
                        // This is where, we will keep the properties
                        // fieldsets.
                        content = $('<div></div>').addClass('pg-prop-content'),
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
                                        'pg-prop-btn-group col-lg-8 col-sm-10 col-md-8 col-xs-12'
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
                                view.close();
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
                            j.prepend(content);
                        };

                    // Call the createFunc(...) by default to open the create
                    // node fieldset in properties tab.
                    createFunc();
                }
            },
            // Create the node in the alertify dialog
            create_obj_dlg: function() {
            },
            // Delete the selected object
            delete_obj: function() {
                console.log(arguments);
            },
            // Rename the selected object
            rename_obj: function() {
                console.log(arguments);
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
                        this.showProperties(o.browser.tree, o.item, o.data, '#obj_props');
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
        showProperties: function(tree, item, node, el) {
            var that = this,
                j = $(el),
                view = j.data('obj-view'),
                content = $('<div></div>').addClass('pg-prop-content'),
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
                                'pg-prop-btn-group col-lg-8 col-sm-10 col-md-8 col-xs-12'
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
                        view.close();
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
                            label: '{{ _('Edit') }}', type: 'edit',
                            extraClasses: ['btn-primary'],
                            register: function(btn) {
                                btn.click(function() {
                                    editFunc();
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
                        view.close();
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
                            label: '{{ _('Save') }}', type: 'save',
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
                            label: '{{ _('Reset') }}', type: 'reset',
                            extraClasses: ['btn-warning'],
                            register: function(btn) {
                                btn.click(function() {
                                    setTimeout(function() { editFunc(); }, 100);
                                });
                            }
                        }]);
                    }
                    // Show contents before buttons
                    j.prepend(content);
                };

            /* Show properties */
            properties();
        },
        // What am I refering to (parent or me)?
        reference: function(d) {
            return (d._type == this.type ?
                    (d.refid ? '/' + d.refid : '') : ( '/' + d._id + '/'));
        },
        // Generate the URL for different purposes
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
        },
        // Base class for Node Model
        Model: Backbone.Model
    });

    return pgAdmin.Browser.Node;
});
