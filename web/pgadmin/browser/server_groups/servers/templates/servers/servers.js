define(
        ['jquery', 'underscore', 'pgadmin', 'pgadmin.browser', 'alertify'],
function($, _, pgAdmin, pgBrowser, alertify) {

  if (!pgBrowser.Nodes['server']) {
    pgAdmin.Browser.Nodes['server'] = pgAdmin.Browser.Node.extend({
      parent_type: 'server-group',
      type: 'server',
      label: '{{ _('Server...') }}',
      Init: function() {

        /* Avoid multiple registration of same menus */
        if (this.initialized)
          return;

        this.initialized = true;

        pgBrowser.add_menus([{
          name: 'create_server_on_sg', node: 'server-group', module: this,
          applies: ['object', 'context'], callback: 'create_obj',
          category: 'create', priority: 1, label: '{{ _('Server...') }}'
        }, {
          name: 'create_server_on_sg_dlg', node: 'server-group', module: this,
          applies: ['object', 'context'], callback: 'create_obj_dlg',
          category: 'create', priority: 2, label: '{{ _('Server (Dialog)...') }}'
        },{
          name: 'create_server', node: 'server', module: this,
          applies: ['object', 'context'], callback: 'create_obj',
          category: 'create', priority: 3, label: '{{ _('Server...') }}'
        }, {
          name: 'create_server_dlg', node: 'server', module: this,
          applies: ['object', 'context'], callback: 'create_obj_dlg',
          category: 'create', priority: 4, label: '{{ _('Server (Dialog)...') }}'
        },{
          name: 'drop_server', node: 'server', module: this,
          applies: ['object', 'context'], callback: 'delete_obj',
          category: 'drop', priority: 3, label: '{{ _('Drop Server...') }}'
        }, {
          name: 'rename_server', node: 'server', module: this,
          applies: ['object', 'context'], callback: 'rename_obj',
          category: 'renmae', priority: 4, label: '{{ _('Rename Server...') }}'
        }]);
      },
      callbacks: {
        // Add a server
        create_server: function (item) {
          var alert = alertify.prompt(
            '{{ _('Create a server') }}',
            '{{ _('Enter a name for the new server') }}',
            '',
            function(evt, value) {
              var d = tree.itemData(item);
              if (d._type != 'server-group') {
                d = tree.itemData(tree.parent(item));
              }
              $.post(
                "{{ url_for('browser.index') }}server/obj/" + d.refid + '/' + d.id + '/',
                { name: value }
                )
                .done(function(data) {
                  if (data.success == 0) {
                    report_error(data.errormsg, data.info);
                  } else {
                    var item = {
                      id: data.data.id,
                      label: data.data.name,
                      inode: true,
                      open: false,
                      icon: 'icon-server-not-connected'
                    }
                    tree.append(null, {
                      itemData: item
                      });
                  }
                });
            },
            null
            );
            alert.show();
          },
        // Delete a server
        drop_server: function (item) {
          alertify.confirm(
            '{{ _('Drop server?') }}',
            '{{ _('Are you sure you wish to drop the server "{0}"?') }}'.replace('{0}', tree.getLabel(item)),
            function() {
              var id = tree.getId(item).split('/').pop()
              $.ajax({
                url:"{{ url_for('browser.index') }}" + d._type + "/obj/" + d.refid + '/' + d.id,
                type:'DELETE',
                success: function(data) {
                  if (data.success == 0) {
                    report_error(data.errormsg, data.info);
                  } else {
                    var next = tree.next(item);
                    var prev = tree.prev(item);
                    tree.remove(item);
                    if (next.length) {
                      tree.select(next);
                    } else if (prev.length) {
                      tree.select(prev);
                    }
                  }
                }})
              },
              null
            )
        },
        // Rename a server
        rename_server: function (item) {
          alertify.prompt(
            '{{ _('Rename server') }}',
            '{{ _('Enter a new name for the server') }}',
            tree.getLabel(item),
            function(evt, value) {
              var d = tree.itemData(item);
              $.ajax({
                url:"{{ url_for('browser.index') }}" + d._type + "/obj/" + d.refid,
                type:'PUT',
                params: {name: value},
                success: function(data) {
                  if (data.success == 0) {
                    report_error(data.errormsg, data.info);
                  } else {
                    tree.setLabel(item, { label: value });
                  }
                }})
            },
            null
          )
        },
        /* Connect the server (if not connected), before opening this node */
        beforeopen: function(o) {
          o.browser.tree.removeIcon(o.item);
          if (o.data.connected) {
            o.browser.tree.addIcon(o.item, {icon: 'icon-server-connected'});
          } else {
            o.browser.tree.addIcon(o.item, {icon: 'icon-server-not-connected'});
          }
          var data = o.data;
          if(!data || data._type != 'server') {
            return false;
          }
          if (!data.connected) {
            alertify.confirm(
              '{{ _('Connect to server') }}',
              '{{ _('Do you want to connect the server?') }}',
              function(evt) {
                $.post(
                  "{{ url_for('browser.index') }}server/connect/" + data.refid + '/'
                  ).done(function(data) {
                    if (data.success == 0) {
                      report_error(data.errormsg, data.info);
                    }
                  }).fail(function() {});
                return true;
              },
              function(evt) {
                return true;
              }
            );
            return false;
          }
          return true;
        }
      },
      model: pgAdmin.Browser.Node.Model.extend({
        defaults: {
          id: undefined,
          name: undefined,
          sslmode: 'prefer'
        },
        schema: [{
          id: 'id', label: 'ID', type: 'int', group: null,
          mode: ['properties']
        },{
          id: 'name', label:'Name', type: 'text', group: null,
          mode: ['properties', 'edit', 'create']
        },{
          id: 'connected', label:'Connected', type: 'text', group: null,
          mode: ['properties']
        },{
          id: 'version', label:'Version', type: 'text', group: null,
          mode: ['properties'], show: 'isConnected'
        },{
          id: 'comment', label:'Comments:', type: 'multiline', group: null,
          mode: ['properties', 'edit', 'create'], disable: 'notEditMode'
        },{
          id: 'host', label:'Host Name/Address', type: 'text', group: "Connection",
          mode: ['properties', 'edit', 'create']
        },{
          id: 'port', label:'Port', type: 'int', group: "Connection",
          mode: ['properties', 'edit', 'create']
        },{
          id: 'db', label:'Maintenance Database', type: 'text', group: "Connection",
          mode: ['properties', 'edit', 'create']
        },{
          id: 'username', label:'User Name', type: 'text', group: "Connection",
          mode: ['properties', 'edit', 'create']
        },{
          id: 'sslmode', label:'SSL Mode', type: 'options', group: "Connection",
          mode: ['properties', 'edit', 'create'],
          'options': [{label:'Allow', value:'allow'}, {label: 'Prefer', value:'prefer'}, {label: 'Require', value: 'require'}, {label: 'Disable', value:'disable'}, {label:'Verify-CA', value: 'verify-ca'}, {label:'Verify-Full', value:'verify-full'}]
        }],
        validate: function(attrs, options) {
          if (!this.isNew() && 'id' in this.changed) {
            return '{{ _('Id can not be changed!') }}';
          }
          if (String(this.name).replace(/^\s+|\s+$/g, '') == '') {
            return '{{ _('Name can be empty!') }}';
          }
          return null;
        },
        isConnected: function(mode) {
          return mode == 'properties' && this.get('connected');
        },
        notEditMode: function(mode) {
          return mode != 'edit';
        }})
      });
  }

  return pgBrowser.Nodes['server'];
});
