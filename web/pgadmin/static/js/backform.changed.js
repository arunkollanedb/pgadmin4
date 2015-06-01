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
    define(['underscore', 'jquery', 'backbone'], function(_, $, Backbone) {
      // Export global even in AMD case in case this script is loaded with
      // others that may still expect a global Backform.
      return factory(root, _, $, Backbone);
    });

  // Next for Node.js or CommonJS. jQuery may not be needed as a module.
  } else if (typeof exports !== 'undefined') {
    var _ = require('underscore');
    factory(root, _, (root.jQuery || root.$ || root.Zepto || root.ender), root.Backbone);

  // Finally, as a browser global.
  } else {
    factory(root, root._, (root.jQuery || root.Zepto || root.ender || root.$), root.Backbone);
  }
}(this, function(root, _, $, Backbone) {

  // Backform namespace and global options
  Backform = root.Backform = {
    // HTML markup global class names. More can be added by individual controls
    // using _.extend. Look at RadioControl as an example.
    formClassName: "backform form-horizontal",
    groupClassName: "form-group",
    controlLabelClassName: "control-label col-sm-4",
    controlsClassName: "col-sm-8",
    controlClassName: "form-control",
    setGroupClassName: "set-group",
    helpClassName: "help-block",
    errorClassName: "has-error",
    helpMessageClassName: "help-block",
    tabClassName: "backform-tab",
    tableControlClass: "col-lg-11 col-sm-11 col-md-11 col-xs-11",
    tdLabelClassName: "col-sm-4 col-xs-4 col-lg-4",
    tdControlClassName: "col-sm-7 col-xs-7 col-lg-7",

    // Bootstrap 2.3 adapter
    bootstrap2: function() {
      _.extend(Backform, {
        groupClassName: "control-group",
        controlLabelClassName: "control-label",
        controlsClassName: "controls",
        controlClassName: "input-xlarge",
        helpClassName: "text-error",
        errorClassName: "error",
        helpMessageClassName: "help-message small"
      });
      _.each(Backform, function(value, name) {
        if (_.isFunction(Backform[name]) &&
            _.isFunction(Backform[name].prototype["bootstrap2"]))
          Backform[name].prototype["bootstrap2"]();
      });
    },
    // https://github.com/wyuenho/backgrid/blob/master/lib/backgrid.js
    resolveNameToClass: function(name, suffix) {
      if (_.isString(name)) {
        var key = _.map(name.split('-'), function(e) {
          return e.slice(0, 1).toUpperCase() + e.slice(1);
        }).join('') + suffix;
        var klass = Backform[key];
        if (_.isUndefined(klass)) {
          throw new ReferenceError("Class '" + key + "' not found");
        }
        return klass;
      }
      return name;
    }
  };


  // Backform Form view
  // A collection of field models.
  var Form = Backform.Form = Backbone.View.extend({
    fields: undefined,
    errorModel: undefined,
    tagName: "form",
    className: function() {
      return Backform.formClassName;
    },
    initialize: function(options) {
      if (!(options.fields instanceof Backbone.Collection))
        options.fields = new Fields(options.fields || this.fields);
      this.fields = options.fields;
      this.model.errorModel = options.errorModel || this.model.errorModel || new Backbone.Model();
    },
    render: function(formType) {
      this.$el.empty();

      var form = this,
          $form = this.$el,
          model = this.model;

      formType = formType || this.formType;
      this.formType = formType;

      this.fields.each(function(field) {
        var control = new (field.get("control"))({
          field: field,
          model: model
        });
        $form.append(control.render(formType).$el);
      });

      return this;
    }
  });

  // Converting data to/from Model/DOM.
  // Stolen directly from Backgrid's CellFormatter.
  // Source: http://backgridjs.com/ref/formatter.html
  /**
     Just a convenient class for interested parties to subclass.

     The default Cell classes don't require the formatter to be a subclass of
     Formatter as long as the fromRaw(rawData) and toRaw(formattedData) methods
     are defined.

     @abstract
     @class Backform.ControlFormatter
     @constructor
  */
  var ControlFormatter = Backform.ControlFormatter = function() {};
  _.extend(ControlFormatter.prototype, {

    /**
       Takes a raw value from a model and returns an optionally formatted string
       for display. The default implementation simply returns the supplied value
       as is without any type conversion.

       @member Backform.ControlFormatter
       @param {*} rawData
       @param {Backbone.Model} model Used for more complicated formatting
       @return {*}
    */
    fromRaw: function (rawData, model) {
      return rawData;
    },

    /**
       Takes a formatted string, usually from user input, and returns a
       appropriately typed value for persistence in the model.

       If the user input is invalid or unable to be converted to a raw value
       suitable for persistence in the model, toRaw must return `undefined`.

       @member Backform.ControlFormatter
       @param {string} formattedData
       @param {Backbone.Model} model Used for more complicated formatting
       @return {*|undefined}
    */
    toRaw: function (formattedData, model) {
      return formattedData;
    }

  });

  // Store value in DOM as stringified JSON.
  var JSONFormatter = Backform.JSONFormatter = function() {};
  _.extend(JSONFormatter.prototype, {
    fromRaw: function(rawData, model) {
      return JSON.stringify(rawData);
    },
    toRaw: function(formattedData, model) {
      return JSON.parse(formattedData);
    }
  });

  // Field model and collection
  // A field maps a model attriute to a control for rendering and capturing user input
  var Field = Backform.Field = Backbone.Model.extend({
    defaults: {
      name: "", // Name of the model attribute; accepts "." nested path (e.g. x.y.z)
      placeholder: "",
      show: function() { return true; },
      disabled: false,
      required: false,
      value: undefined, // Optional. Default value when model is empty.
      control: undefined, // Control name or class
      formatter: undefined,
      isGroup: false
    },
    initialize: function(res) {
      if (_.has(res, 'fields') && _.isArray(res['fields'])) {
        var fields = []
        for (idx in res.fields) {
            fields.push(new Backform.Field(res.fields[idx], {parse: true}));
        }

        this.set({
          control:
            Backform.resolveNameToClass(res.control || "fieldset", "Control")
        }, {silent: true});
        this.set({fields: fields}, {silent: true});
        this.set({containerId: _.uniqueId('pgF_')}, {silent: true});
        this.set({headId: _.uniqueId('pgHF_')}, {silent: true});
        this.set({isGroup: true}, {silent: true});
      }
      else {
        var control = Backform.resolveNameToClass(this.get("control"), "Control");
        this.set({control: control}, {silent: true});
      }
      return this;
    }
  });

  var Fields = Backform.Fields = Backbone.Collection.extend({
    model: Field
  });

  // Base Control class
  var Control = Backform.Control = Backbone.View.extend({
    defaults: {}, // Additional field defaults
    className: function() {
      return Backform.groupClassName;
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <span class="<%=Backform.controlClassName%> uneditable-input"><%-value%></span>',
      '</div>'
    ].join("")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%=Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%=Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlClassName %> uneditable-input"><%-value%></span>',
          '</td></tr>'
        ].join(""))
    },
    initialize: function(options) {
      this.field = options.field; // Back-reference to the field

      var formatter = Backform.resolveNameToClass(this.field.get("formatter") || this.formatter, "Formatter");
      if (!_.isFunction(formatter.fromRaw) && !_.isFunction(formatter.toRaw)) {
        formatter = new formatter();
      }
      this.formatter = formatter;

      var attrArr = this.field.get('name').split('.');
      var name = attrArr.shift();

      this.listenTo(this.model, "change:" + name, this.render);
      if (this.model.errorModel instanceof Backbone.Model)
        this.listenTo(this.model.errorModel, "change:" + name, this.updateInvalid);
    },
    formatter: ControlFormatter,
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find(".uneditable-input").text(), this.model);
    },
    onChange: function(e) {
      var model = this.model,
          $el = $(e.target),
          attrArr = this.field.get("name").split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          value = this.getValueFromDOM(),
          changes = {};

      if (this.model.errorModel instanceof Backbone.Model) {
        if (_.isEmpty(path)) {
          this.model.errorModel.unset(name);
        } else {
          var nestedError = this.model.errorModel.get(name);
          if (nestedError) {
            this.keyPathSetter(nestedError, path, null);
            this.model.errorModel.set(name, nestedError);
          }
        }
      }

      changes[name] = _.isEmpty(path) ? value : _.clone(model.get(name)) || {};

      if (!_.isEmpty(path)) this.keyPathSetter(changes[name], path, value);
      this.stopListening(this.model, "change:" + name, this.render);
      model.set(changes);
      this.listenTo(this.model, "change:" + name, this.render);
    },
    render: function(formType) {
      var field = _.defaults(this.field.toJSON(), this.defaults),
          attributes = this.model.toJSON(),
          attrArr = field.name.split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          rawValue = this.keyPathAccessor(attributes[name], path),
          data = _.extend(field, {
            rawValue: rawValue,
            value: this.formatter.fromRaw(rawValue, this.model),
            attributes: attributes,
            formatter: this.formatter
          });

      if (field.show) {
        data['shown'] = field.show.apply(this.model, [formType]);
      }

      if (field.disable && typeof field.disable == 'function') {
        data['disabled'] = field.disable.apply(this.model, [formType]);
      }

      formType = formType || this.formType;
      this.formType = formType;

      if (formType && this.templates[formType]) {
        this.$el = $(this.templates[formType](data)).addClass(field.name);;
      } else {
        this.$el.html(this.template(data)).addClass(field.name);
      }

      this.updateInvalid();
      return this;
    },
    clearInvalid: function() {
      this.$el.removeClass(Backform.errorClassName)
        .find("." + Backform.helpClassName + ".error").remove();
      return this;
    },
    updateInvalid: function() {
      var errorModel = this.model.errorModel;
      if (!(errorModel instanceof Backbone.Model)) return this;

      this.clearInvalid();

      var attrArr = this.field.get('name').split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          error = errorModel.get(name);

      if (_.isEmpty(error)) return;
      if (_.isObject(error)) error = this.keyPathAccessor(error, path);
      if (_.isEmpty(error)) return;

      this.$el.addClass(Backform.errorClassName);
      this.$el.find("." + Backform.controlsClassName)
        .append('<span class="' + Backform.helpClassName + ' error">' + (_.isArray(error) ? error.join(", ") : error) + '</span>');

      return this;
    },
    keyPathAccessor: function(obj, path) {
      var res = obj;
      path = path.split('.');
      for (var i = 0; i < path.length; i++) {
        if (_.isNull(res)) return null;
        if (_.isEmpty(path[i])) continue;
        if (!_.isUndefined(res[path[i]])) res = res[path[i]];
      }
      return _.isObject(res) && !_.isArray(res) ? null : res;
    },
    keyPathSetter: function(obj, path, value) {
      path = path.split('.');
      while (path.length > 1) {
        if (!obj[path[0]]) obj[path[0]] = {};
        obj = obj[path.shift()];
      }
      return obj[path.shift()] = value;
    }
  });

  // Built-in controls

  var UneditableInputControl = Backform.UneditableInputControl = Control;

  var HelpControl = Backform.HelpControl = Control.extend({
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>">&nbsp;</label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <span class="<%=Backform.helpMessageClassName%> help-block"><%-label%></span>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%=Backform.tdLabelClassName%>"></tr>',
          '<td class="<%=Backform.tdControlClassName%>">',
          ' <span class="<%=Backform.helpMessageClassName%> help-block"><%-label%></span>',
          '</td></tr>'].join(""))
    }
  });

  var SpacerControl = Backform.SpacerControl = Control.extend({
    template: _.template(
      '<label class="col-sm-12">&nbsp;</label>'),
    templates: {
      'properties': _.template('<tr colspan="2" class="spacer"></tr>')
    }
  });

  var TextareaControl = Backform.TextareaControl = Control.extend({
    defaults: {
      label: "",
      maxlength: 4000,
      extraClasses: [],
      helpMessage: ""
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <textarea class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" maxlength="<%=maxlength%>" placeholder="<%-placeholder%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%>><%-value%></textarea>',
      '  <% if (helpMessage.length) { %>',
      '    <span class="<%=Backform.helpMessageClassName%>"><%-helpMessage%></span>',
      '  <% } %>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
    _.template([
      '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
      '<td colspan="2" class="<%= Backform.tdLabelClassName %>"><label><%-label%></label></td></tr>',
      '<tr><td colspan="2" class="<%=Backform.tdControlClassName%>">',
      '  <textarea class="<%=Backform.controlClassName%>" name="<%=name%>" maxlength="<%=maxlength%>" placeholder="<%=placeholder%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%>><%-value%></textarea>',
      ' <span class="<%=Backform.helpMessageClassName%> help-block"><%-helpMessage%></span>',
      '</td></tr>'].join(""))
    },
    events: {
      "change textarea": "onChange",
      "focus textarea": "clearInvalid"
    },
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("textarea").val(), this.model);
    }
  });

  var SelectControl = Backform.SelectControl = Control.extend({
    defaults: {
      label: "",
      options: [], // List of options as [{label:<label>, value:<value>}, ...]
      extraClasses: []
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <select class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-value%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> >',
      '    <% for (var i=0; i < options.length; i++) { %>',
      '      <% var option = options[i]; %>',
      '      <option value="<%-formatter.fromRaw(option.value)%>" <%=option.value === rawValue ? "selected=\'selected\'" : ""%> <%=option.disabled ? "disabled=\'disabled\'" : ""%>><%-option.label%></option>',
      '    <% } %>',
      '  </select>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlsClassName%>">',
          '<select class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-value%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> >',
          '<% for (var i=0; i < options.length; i++) { %>',
          ' <% var option = options[i]; %>',
          ' <option value="<%-formatter.fromRaw(option.value)%>" <%=option.value === rawValue ? "selected=\'selected\'" : ""%> <%=option.disabled ? "disabled=\'disabled\'" : ""%>><%-option.label%></option>',
          '<% } %>',
          '</select>',
          '</span></td></tr>'].join(""))
    },
    events: {
      "change select": "onChange",
      "focus select": "clearInvalid"
    },
    formatter: JSONFormatter,
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("select").val(), this.model);
    }
  });

  var MultiSelectControl = Backform.MultiSelectControl = Control.extend({
    defaults: {
      label: "",
      options: [], // List of options as [{label:<label>, value:<value>}, ...]
      extraClasses: [],
      height: '78px'
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <select multiple="multiple" class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-value%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> style="height:<%=height%>">',
      '    <% for (var i=0; i < options.length; i++) { %>',
      '      <% var option = options[i]; %>',
      '      <option value="<%-formatter.fromRaw(option.value)%>" <%=option.value == rawValue ? "selected=\'selected\'" : ""%> <%=option.disabled ? "disabled=\'disabled\'" : ""%>><%-option.label%></option>',
      '    <% } %>',
      '  </select>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlsClassName%>">',
          '<select multiple="multiple" class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-value%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> style="height:<%=height%>">',
          '<% for (var i=0; i < options.length; i++) { %>',
          ' <% var option = options[i]; %>',
          '<option value="<%-formatter.fromRaw(option.value)%>" <%=option.value == rawValue ? "selected=\'selected\'" : ""%> <%=option.disabled ? "disabled=\'disabled\'" : ""%>><%-option.label%></option>',
          '<% } %>',
          '</select></span></td></tr>'].join(""))
    },
    events: {
      "change select": "onChange",
      "dblclick select": "onDoubleClick",
      "focus select": "clearInvalid"
    },
    formatter: JSONFormatter,
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("select").val(), this.model);
    },
    onDoubleClick: function(e) {
      this.model.trigger('doubleclick', e);
    }
  });

  var InputControl = Backform.InputControl = Control.extend({
    defaults: {
      type: "text",
      label: "",
      maxlength: 255,
      extraClasses: [],
      helpMessage: ''
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '  <input type="<%=type%>" class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" maxlength="<%=maxlength%>" value="<%-value%>" placeholder="<%=placeholder%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> />',
      '  <% if (helpMessage.length) { %>',
      '    <span class="<%=Backform.helpMessageClassName%>"><%-helpMessage%></span>',
      '  <% } %>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlsClassName%>">',
          '<input type="<%=type%>" class="<%=Backform.controlClassName%> <%=extraClasses.join(\' \')%>" name="<%=name%>" maxlength="<%=maxlength%>" value="<%-value%>" placeholder="<%=placeholder%>" <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> />',
          '<% if (helpMessage.length) { %>',
          '<span class="<%=Backform.helpMessageClassName%>"><%-helpMessage%></span>',
          '<% } %>',
          '</span></td></tr>'].join(""))
    },
    events: {
      "change input": "onChange",
      "focus input": "clearInvalid"
    },
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("input").val(), this.model);
    }
  });

  var BooleanControl = Backform.BooleanControl = InputControl.extend({
    defaults: {
      type: "checkbox",
      label: "",
      controlLabel: '&nbsp;',
      extraClasses: []
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%=controlLabel%></label>',
      '<div class="<%=Backform.controlsClassName%>">',
      '    <label>',
      '      <input type="<%=type%>" class="<%=extraClasses.join(\' \')%>" name="<%=name%>" <%=value ? "checked=\'checked\'" : ""%> <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> /> <%-label%>',
      '    </label>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlsClassName%>">',
          '<label>',
          '<input type="<%=type%>" class="<%=extraClasses.join(\' \')%>" name="<%=name%>" <%=value ? "checked=\'checked\'" : ""%> <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> /> <%-label%>',
          '</label>',
          '</span></td></tr>'].join(""))
    },
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("input").is(":checked"), this.model);
    }
  });

  var CheckboxControl = Backform.CheckboxControl = BooleanControl;

  var RadioControl = Backform.RadioControl = InputControl.extend({
    defaults: {
      type: "radio",
      label: "",
      options: [],
      extraClasses: []
    },
    template: _.template([
      '<label class="<%=Backform.controlLabelClassName%>"><%-label%></label>',
      '<div class="<%=Backform.controlsClassName%> <%=Backform.radioControlsClassName%>">',
      '  <% for (var i=0; i < options.length; i++) { %>',
      '    <% var option = options[i]; %>',
      '    <label class="<%=Backform.radioLabelClassName%>">',
      '      <input type="<%=type%>" class="<%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-formatter.fromRaw(option.value)%>" <%=rawValue == option.value ? "checked=\'checked\'" : ""%> <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> /> <%-option.label%>',
      '    </label>',
      '  <% } %>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties': 
        _.template([
          '<tr class="<%=Backform.trLabelClassName%> <%=shown ? "" : "collapse"%>">',
          '<td class="<%Backform.tdLabelClassName%>"><label><%-label%></label></td>',
          '<td class="<%Backform.tdControlClassName%>">',
          '<span class="<%=Backform.controlsClassName%>">',
          '<% for (var i=0; i < options.length; i++) { %>',
          ' <% var option = options[i]; %>',
          '<label class="<%=Backform.radioLabelClassName%>">',
          '<input type="<%=type%>" class="<%=extraClasses.join(\' \')%>" name="<%=name%>" value="<%-formatter.fromRaw(option.value)%>" <%=rawValue == option.value ? "checked=\'checked\'" : ""%> <%=disabled ? "disabled" : ""%> <%=required ? "required" : ""%> /> <%-option.label%>',
          '</label>',
          '<% } %>',,
          '</span></td></tr>'].join(""))
    },
    formatter: JSONFormatter,
    getValueFromDOM: function() {
      return this.formatter.toRaw(this.$el.find("input:checked").val(), this.model);
    },
    bootstrap2: function() {
      Backform.radioControlsClassName = "controls";
      Backform.radioLabelClassName = "radio inline";
    }
  });
  _.extend(Backform, {
    radioControlsClassName: "checkbox",
    radioLabelClassName: "checkbox-inline"
  });

  // Requires the Bootstrap Datepicker to work.
  var DatepickerControl = Backform.DatepickerControl = InputControl.extend({
    defaults: {
      type: "text",
      label: "",
      options: {},
      extraClasses: [],
      maxlength: 255,
      helpMessage: ''
    },
    events: {
      "blur input": "onChange",
      "change input": "onChange",
      "changeDate input": "onChange",
      "focus input": "clearInvalid"
    },
    render: function() {
      InputControl.prototype.render.apply(this, arguments);
      this.$el.find("input").datepicker(this.field.get("options"));
      return this;
    }
  });

  var ButtonControl = Backform.ButtonControl = Control.extend({
    defaults: {
      type: "submit",
      label: "Submit",
      status: undefined, // error or success
      message: undefined,
      extraClasses: []
    },
    template: _.template([
      '<div class="<%=Backform.controlsClassName%>">',
      '  <button type="<%=type%>" name="<%=name%>" class="btn <%=extraClasses.join(\' \')%>" <%=disabled ? "disabled" : ""%> ><%-label%></button>',
      '  <% var cls = ""; if (status == "error") cls = Backform.buttonStatusErrorClassName; if (status == "success") cls = Backform.buttonStatusSuccessClassname; %>',
      '  <span class="status <%=cls%>"><%=message%></span>',
      '</div>'
    ].join("\n")),
    templates: {
      'properties':  undefined,
      'edit': undefined
    },
    initialize: function() {
      Control.prototype.initialize.apply(this, arguments);
      this.listenTo(this.field, "change:status", this.render);
      this.listenTo(this.field, "change:message", this.render);
    },
    bootstrap2: function() {
      Backform.buttonStatusErrorClassName = "text-error";
      Backform.buttonStatusSuccessClassname = "text-success";
    }
  });
  _.extend(Backform, {
    buttonStatusErrorClassName: "text-danger",
    buttonStatusSuccessClassname: "text-success"
  });

  var FieldsetControl = Backform.FieldsetControl = Control.extend({
    defaults: {
      label: "",
      extraClasses: [],
      helpMessage: '',
      fields: []
    },
    template: _.template([
      '<fieldset class="<%=Backform.setGroupClassName%> col-sm-12 <%= extraClasses.join(\' \') %>"<%=disabled ? "disabled" : ""%>>',
      '  <legend class="badge" data-toggle="collapse" data-target="#<%=containerId%>"><span class="caret"></span> <%=label%></legend>',
      '  <div id="<%= containerId %>" class="fieldset-content collapse in">',
      '  <% if (helpMessage.length) { %>',
      '    <span class="<%=Backform.helpMessageClassName%>"><%=helpMessage%></span>',
      '  <% } %>',
      '  </div>',
      '</fieldset>'
    ].join("\n")),
    render: function(formType) {
      var field = _.defaults(this.field.toJSON(), this.defaults),
          attributes = this.model.toJSON(),
          attrArr = field.name.split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          rawValue = this.keyPathAccessor(attributes[name], path),
          data = _.extend(field, {
            rawValue: rawValue,
            value: this.formatter.fromRaw(rawValue, this.model),
            attributes: attributes,
            formatter: this.formatter
          });

      formType = formType || this.formType;
      this.formType = formType;

      this.$el = $(this.template(data));
      this.$el.addClass(field.name);
      this.updateInvalid();

      var form = this,
          $form = this.$el.find(".fieldset-content").first(),
          model = this.model;

      if (data.fields && _.isArray(data.fields)) {
          for (idx in data.fields) {
              var field = data.fields[idx];
              var control = new (field.get('control'))({
                  field: field,
                  model: this.model,
                  disabled: this.disabled
              });
              
              $form.append(control.render(formType).$el);
          }
      }

      return this;
    },
    getValueFromDOM: function() {
      return "";
    },
    events: {}
  });


  // Backform Tab view
  // A collection of field models in tabs.
  var Tab = Backform.Tab = Backbone.View.extend({
    fields: undefined,
    errorModel: undefined,
    tagName: "li",
    className: function() {
      return Backform.formClassName;
    },
    initialize: function(options) {
      if (!(options.fields instanceof Backbone.Collection))
        options.fields = new Fields(options.fields || this.fields);
      var fields = options.fields;
      /*
       * Convert the regular controls to tag supported list
       */
      fields.each(function(field) {
        if (field.get('isGroup')) {
          field.set({
            control: Backform.resolveNameToClass("tab", "Control")
          }, {silent: true});
        }
      });
      this.fields = fields;
      this.model.errorModel = options.errorModel || this.model.errorModel || new Backbone.Model();
    },
    render: function(formType) {
      this.$el.empty();
      this.$el.attr('role', 'tabpanel');
      this.$el.attr('class', Backform.tabClassName);
      var tabHead = $('<ul class="nav nav-tabs" role="tablist"></ul>')
        .appendTo(this.$el);
      var tabContent = $('<ul class="tab-content"></ul>')
        .appendTo(this.$el);

      var form = this,
          $form = this.$el,
          model = this.model,
          tab = {head: tabHead, container: tabContent};

      formType = formType || this.formType;
      this.formType = formType;

      this.fields.each(function(field) {
        var control = new (field.get("control"))({
          field: field,
          model: model,
          tab: tab
        });
        $form.append(control.render(formType).$el);
      });
      tabHead.find('[role="presentation"]').first().addClass('active');
      tabContent.find('[role="tabpanel"]').first().addClass('in active');

      return this;
    }
  });

  var TabControl = Backform.TabControl = FieldsetControl.extend({
    defaults: {
      label: "",
      extraClasses: [],
      helpMessage: '',
      fields: [],
      tab: undefined
    },
    initialize: function(options) {
      Control.prototype.initialize.apply(this, arguments);
      this.tab = options.tab;
    },
    template: _.template([
      '<li role="presentation" <%=disabled ? "disabled" : ""%>>',
      '<a data-toggle="tab" href="#<%=containerId%>"',
      'id="<%=headId%>" aria-controls="<%=containerId%>">',
      '<%=label%></a></li>'].join(" ")),
    tabtemplate: _.template(
      '<div role="tabpanel" class="tab-pane fade" id="<%=containerId%>" aria-labelledby="<%=headId%>"></div>'
      ),
    render: function(formType) {
      if (this.tab) {
        var field = _.defaults(this.field.toJSON(), this.defaults),
            attributes = this.model.toJSON(),
            attrArr = field.name.split('.'),
            name = attrArr.shift(),
            path = attrArr.join('.'),
            rawValue = this.keyPathAccessor(attributes[name], path),
            data = _.extend(field, {
              rawValue: rawValue,
              value: this.formatter.fromRaw(rawValue, this.model),
              attributes: attributes,
              formatter: this.formatter
            });

        var form = this,
            $form = $(this.tabtemplate(data)),
            model = this.model;

        formType = formType || this.formType;
        this.formType = formType;

        this.tab.container.append($form);
        this.tab.head.append($(this.template(data)));
        this.updateInvalid();
        this.$el.removeClass('collapse').addClass('collapse');

        if (data.fields && _.isArray(data.fields)) {
            var that = this;
            _.each(data.fields, function(field) {
                var control = new (field.get('control'))({
                    field: field,
                    model: that.model,
                    disabled: field.disabled
                });
                $form.append(control.render(formType).$el);
            });
        }
        return this;
      } else {
        return FieldsetControl.prototype.render.apply(this, arguments);
      }
    },
    getValueFromDOM: function() {
      return "";
    },
    events: {}
  });

  var TableControl = Backform.TableControl = FieldsetControl.extend({
    defaults: {
      label: "",
      extraClasses: ['pgadmin-properties'],
      helpMessage: '',
      fields: []
    },
    template: _.template([
      '<div class="<%=Backform.tableControlClass%>">',
      '<div class="badge" data-toggle="collapse" data-target="#<%=containerId%>"><span class="caret"></span> <%=label%></div>',
      '<div class="collapse in <%=extraClasses.join(\' \')%>" id="<%=containerId%>">',
      '<table class="<%=Backform.tableClass%>" <%=disabled ? "disabled" : ""%>>',
      '<thead><th><%=Backform.tblHeadName%></th><th><%=Backform.tblHeadValue%></th></thead></table></div></div>'
      ].join(" ")),
      
    render: function(formType) {
      var field = _.defaults(this.field.toJSON(), this.defaults),
          attributes = this.model.toJSON(),
          attrArr = field.name.split('.'),
          name = attrArr.shift(),
          path = attrArr.join('.'),
          rawValue = this.keyPathAccessor(attributes[name], path),
          data = _.extend(field, {
            rawValue: rawValue,
            value: this.formatter.fromRaw(rawValue, this.model),
            attributes: attributes,
            formatter: this.formatter
          });

      formType = formType || this.formType;
      this.formType = formType;

      this.$el = $(this.template(data));
      var form = this,
          $form = $('<tbody></tbody>').appendTo(this.$el.find('table')),
          model = this.model;

      if (data.fields && _.isArray(data.fields)) {
          var that = this;
          _.each(data.fields, function(field) {
              var control = new (field.get('control'))({
                  field: field,
                  model: that.model,
                  disabled: field.disabled
              });
              $form.append(control.render(formType || 'properties').$el);
          });
      }

      this.updateInvalid();
      return this;
    },
    getValueFromDOM: function() {
      return "";
    },
    events: {}
  });

  return Backform;

}));
