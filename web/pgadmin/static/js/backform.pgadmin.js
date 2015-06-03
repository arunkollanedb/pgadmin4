/*
  Backform
  http://github.com/amiliaapp/backform

  Copyright (c) 2014 Amilia Inc.
  Written by Martin Drapeau
  Licensed under the MIT @license
 */
(function(root, factory) {

  // Set up Backform appropriately for the environment. Start with AMD.
  if (typeof define === 'function' && define.amd) {
    define(['underscore', 'jquery', 'backbone', 'backform'], function(_, $, Backbone, Backform) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backform.
      return factory(root, _, $, Backbone, Backform);
    });

  // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore') || root._,
      $ = root.jQuery || root.$ || root.Zepto || root.ender,
      Backbone = require('backbone') || root.Backbone,
      Backform = require('backform') || root.Backform;
    factory(root, _, $, Backbone, Backform);

  // Finally, as a browser global.
  } else {
    factory(root, root._, (root.jQuery || root.Zepto || root.ender || root.$), root.Backbone, root.Backform);
  }
}(this, function(root, _, $, Backbone, Backform) {

  // HTML markup global class names. More can be added by individual controls
  // using _.extend. Look at RadioControl as an example.
  _.extend(Backform, {
    controlsClassName: "col-sm-8 pgadmin-controls",
    groupClassName: "pgadmin-control-group form-group col-sm-12 col-lg-12 col-md-12 col-xs-12",
    setGroupClassName: "set-group col-sm-12 col-md-12 col-lg-12 col-xs-12",
    tabClassName: "backform-tab",
    setGroupContentClassName: "fieldset-content col-sm-12 col-md-12 col-lg-12 col-xs-12"
    });

  _.extend(Backform.Field.prototype, {
    defaults: {
      name: "", // Name of the model attribute; accepts "." nested path (e.g. x.y.z)
      placeholder: "",
      disabled: false,
      required: false,
      value: undefined, // Optional. Default value when model is empty.
      control: undefined, // Control name or class
      formatter: undefined,
      fields: undefined,
    },
    initialize: function() {
      var control = Backform.resolveNameToClass(this.get("control"), "Control");
      this.set({control: control}, {silent: true});
    }
  });


  // Backform Dialog view (in bootstrap tabbular form)
  // A collection of field models.
  var Dialog = Backform.Dialog = Backform.View.extend({
    /* Array of objects having attributes [label, fields] */
    schema: undefined,
    errorModel: undefined,
    tagName: "form",
    className: function() {
      return Backform.formClassName;
    },
    initialize: function(opts) {
      var s = opts.schema;
      if (s && _.isArray(s)) {
        this.schema = _.each(s, function(o) {
          if (!(o.fields instanceof Backbone.Collection))
            o.fields = new Backform.Fields(o.fields);
          o.cId = o.cId || _.uniqueId('pgC_');
          o.hId = o.hId || _.uniqueId('pgH_');
          o.disabled = o.disabled || false;
        });
      }
      this.model.errorModel = opts.errorModel || this.model.errorModel || new Backbone.Model();
    },
    template: {
      'header': _.template([
        '<li role="presentation" <%=disabled ? "disabled" : ""%>>',
        ' <a data-toggle="tab" href="#<%=cId%>"',
        '  id="<%=hId%>" aria-controls="<%=cId%>">',
        '<%=label%></a></li>'].join(" ")),
      'panel': _.template(
        '<div role="tabpanel" class="tab-pane fade" id="<%=cId%>" aria-labelledby="<%=hId%>"></div>'
      )},
    render: function() {
      var c = 
        this.$el
          .children().first().children('.active')
          .first().attr('id'),
        m = this.model,
        obj = this;

      if (this.controls && _.isArray(this.controls)) {
          _.each(this.controls, function(c) {
              c.close();
              delete c;
          });
      }
      this.controls = [];

      obj.$el
          .empty()
          .attr('role', 'tabpanel')
          .attr('class', Backform.tabClassName);

      var tabHead = $('<ul class="nav nav-tabs" role="tablist"></ul>')
        .appendTo(obj.$el);
      var tabContent = $('<ul class="tab-content"></ul>')
        .appendTo(obj.$el);

      _.each(this.schema, function(o) {
        var el = $((obj.template['panel'])(o))
              .appendTo(tabContent)
              .removeClass('collapse').addClass('collapse'),
            h = $((obj.template['header'])(o)).appendTo(tabHead);

        o.fields.each(function(f) {
          var cntr = new (f.get("control")) ({
            field: f,
            model: m
          });
          el.append(cntr.render().$el);
          this.controls.push(cntr);
        });
      });

      var makeActive = tabHead.find('[id="' + c + '"]').first();
      if (makeActive.length == 1) {
        makeActive.parent().addClass('active');
        tabContent.find('#' + makeActive.attr("aria-controls"))
          .addClass('in active');
      } else {
        tabHead.find('[role="presentation"]').first().addClass('active');
        tabContent.find('[role="tabpanel"]').first().addClass('in active');
      }

      return this;
    },
    onClose: function() {

      _.each(this.schema, function(o) {
          o.fields.each(function(f) {
              f.unbind();
          });
          o.fields.unbind();
          o.fields.remove();
          delete o.fields;
          o.fields = undefined;
      });
    }
  });

  var Fieldset = Backform.Fieldset = Backform.Dialog.extend({
    template: {
      'header': _.template([
        '<fieldset class="<%=Backform.setGroupClassName%>"<%=disabled ? "disabled" : ""%>>',
        '  <legend class="badge" data-toggle="collapse" data-target="#<%=cId%>"><span class="caret"></span> <%=label%></legend>',
        '  ',
        '</fieldset>'
      ].join("\n")),
      'content': _.template(
        '  <div id="<%= cId %>" class="<%=Backform.setGroupContentClassName%> collapse in"></div>'
    )},
    render: function() {
      var m = this.model,
        obj = this;

      if (this.controls && _.isArray(this.controls)) {
        _.each(this.controls, function(c) {
          c.close();
          delete c;
        });
      }
      this.controls = [];
      var c = this.controls;

      obj.$el.empty();

      _.each(this.schema, function(o) {
        var h = $((obj.template['header'])(o)).appendTo(obj.$el), 
          el = $((obj.template['content'])(o))
              .appendTo(h);

        o.fields.each(function(f) {
          var cntr = new (f.get("control")) ({
            field: f,
            model: m
          });
          el.append(cntr.render().$el);
          c.push(cntr);
        });
      });

      return this;
    },
    getValueFromDOM: function() {
      return "";
    },
    events: {}
  });

  return Backform;
}));
