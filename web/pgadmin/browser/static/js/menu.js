define(
   ['underscore', 'pgadmin', 'jquery'],
function(_, pgAdmin, $) {
  'use strict';

  pgAdmin.Browser = pgAdmin.Browser || {};
  pgAdmin.Browser.MenuItem = function(opts) {
    var defaults = [
      'label', 'priority', 'module', 'callback', 'data', 'enable', 'category'
    ];
    _.extend(this, _.pick(opts, defaults));
  };

  _.extend(pgAdmin.Browser.MenuItem.prototype, {
    generate: function() {
      return $('<li/>')
        .addClass('menu-item')
        .append(
          $('<a></a>', {
            'href':'#',
            'data-toggle': 'pg-menu'
          }).data('pg-menu', {
              module: this.module || pgAdmin.Browser,
              cb: this.callback,
              data: this.data
          }).text(this.label).addClass('menu-link')
          );
    }
  });


  // MENU PUBLIC CLASS DEFINITION
  // ==============================
  var Menu = function (element, options) {
    this.$element  = $(element)
    this.options   = $.extend({}, Menu.DEFAULTS, options)
    this.isLoading = false
  }

  Menu.DEFAULTS = {}

  Menu.prototype.toggle = function () {
    var changed = true
    var $parent = this.$element.closest('[data-toggle="pg-menu"]')

    if (changed) this.$element.toggleClass('active')

    var d = this.$element.data('pg-menu');
    var cb = d.module['callbacks'] && d.module['callbacks'][d.cb] || d.module[d.cb];
    if (cb) {
        cb.apply(d.module, [d.data]);
    } else {
        pgAdmin.Browser.report_error('Developer Warning: Callback - "' + d.cb + '" not found!');
    }
  }


  // BUTTON PLUGIN DEFINITION
  // ========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data  = $this.data('pg.menu')
      var options = typeof option == 'object' && option

      if (!data) $this.data('pg.menu', (data = new Menu(this, options)))

      if (option == 'toggle') data.toggle()
      else if (option) data.setState(option)
    })
  }

  var old = $.fn.button

  $.fn.pgmenu       = Plugin
  $.fn.pgmenu.Constructor = Menu


  // BUTTON NO CONFLICT
  // ==================

  $.fn.pgmenu.noConflict = function () {
    $.fn.pgmenu = old;
    return this;
  }

  // MENU DATA-API
  // =============

  $(document)
    .on('click.pg.menu.data-api', '[data-toggle^="pg-menu"]', function (e) {
      var $menu = $(e.target)
      if (!$menu.hasClass('menu-link'))
        $menu = $menu.closest('.menu-link')
      Plugin.call($menu, 'toggle')
      e.preventDefault()
    })
    .on('focus.pg.menu.data-api blur.pg.menu.data-api', '[data-toggle^="pg-menu"]',
      function (e) {
        $(e.target).closest('.menu').toggleClass('focus', /^focus(in)?$/.test(e.type))
      });

  return pgAdmin.Browser.MenuItem;
});
