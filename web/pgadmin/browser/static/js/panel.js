define(
    ['underscore', 'pgadmin', 'wcdocker'],
function(_, pgAdmin) {
    pgAdmin.Browser = pgAdmin.Browser || {};
    pgAdmin.Browser.Panel = function(options) {
        var defaults = [
            'name', 'title', 'width', 'height', 'showTitle', 'isClosable',
            'isPrivate', 'content'];
        _.extend(this, _.pick(options, defaults));
    }

    _.extend(pgAdmin.Browser.Panel.prototype, {
        name:'',
        title: '',
        width: 300,
        height: 600,
        showTitle: true,
        isClosable: true,
        isPrivate: false,
        content: '',
        panel: null,
        load: function(docker) {
            var that = this;
            if (!that.panel) {
                docker.registerPanelType(that.name, {
                    title: that.title,
                    isPrivate: that.isPrivate,
                    onCreate: function(myPanel) {
                        myPanel.initSize(that.width, that.height);
                        if (that.showTitle == false)
                            myPanel.title(false);
                        myPanel.closeable(that.isCloseable == true);
                        myPanel.layout().addItem(that.content, 0, 0).parent().css('height', '100%');
                        that.panel = myPanel;
                    }
                });
            }
        }
    });

    return pgAdmin.Browser.Panel;
});
