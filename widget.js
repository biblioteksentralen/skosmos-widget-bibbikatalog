// declaring a namespace for the plugin
var BIBBI = BIBBI || {};

BIBBI = {
    endpoint: "https://lds.bs.no/api/catalog",

    cache: {},

    listContext: {},

    query: function (uri) {
        // const url = `${this.endpoint}?uri=` + encodeURIComponent(uri);

        const url = `${this.endpoint}?limit=100&q=authorities.id:` + encodeURIComponent(uri.split('/').pop());

        console.log('> ' + url);

        this.render({
            loading: true,
        });

        $.getJSON(url)
            .fail(err => {
                this.render({
                    error: 'Kan ikke vise resultater fra Bibbi katalog akkurat nå på grunn av en feil.',
                });
            })
            .done(res => {
                console.info("Request successful", res);

                const total = res.total;

                const skipRoles = [
                    'manusforf.',
                    'skuesp.',
                    'overs.',
                    'regissør',
                ];

                const sortOrder = [
                    'genre',
                    'topic',
                    'creator',

                ];

                const docs = res.docs
                    .map(doc => {
                        let creators = doc.authorities.filter(aut => aut.type === 'creator' && (!aut.role || skipRoles.indexOf(aut.role) === -1));

                        doc.authorities.sort((a,b ) => {
                            return sortOrder.indexOf(b.type) - sortOrder.indexOf(a.type) ;
                        });

                        doc.authorities.map(aut => {
                            aut.label = aut.label.replace(/\$z/, ' : ');
                            aut.is_creator = (aut.type == 'creator');
                            aut.classname = (() => {
                                if (aut.type === 'creator') {
                                    if (aut.is_person) {
                                        return 'person';
                                    }
                                    return 'organization';
                                }
                                if (aut.type === 'place') {
                                    return 'place';
                                }
                                return 'generic';
                            })();
                        });

                        doc.main_creator = (() => {
                            if (!creators.length) {
                                return null;
                            }
                            let label = creators[0].label || '';
                            let role = creators[0].role || '';
                            if (role === 'forf.') {
                                role = null;
                            }
                            return {
                                label: label.split(':')[0],
                                role: role,
                                id: creators[0].id,
                            };
                        })();

                        doc.image = `https://pim.bibsent.no/thumbs/ImageImport/97/230/362/${doc.ean}.jpg`;

                        doc.doc_type_simple = (() => {
                            if (doc.doc_type && doc.doc_type.match(/bok/i)) {
                                return null;
                            }
                            return doc.doc_type;
                        })();

                        doc.doc_type_class = (() => {
                            if (!doc.doc_type) {
                                return '';
                            }
                            if (doc.doc_type.match(/dataspill/i)) {
                                return 'spill';
                            }
                            if (doc.doc_type.match(/film/i)) {
                                return 'film';
                            }
                            return '';
                        })();

                        return doc;
                    })
                    .sort((doc1, doc2) => doc2.pub_year - doc1.pub_year);

                docs.forEach(doc => {
                    this.cache[doc.id] = doc;
                });

                const groups = [
                    {heading: 'Bruk i Bibbi-katalogen', docs: docs, total_docs: total} // (1) Make it work...
                ];

                this.listContext = {
                    uri: uri,
                    groups: groups,
                    total_docs: total,
                };

                this.render(this.listContext);
            });
    },

	render: function(context) {
        console.info('Render');
        const source = $("#skosmos-widget-bibbikatalog-template").html();
        const template = Handlebars.compile(source);
        const rendered = template(context);
        if ($('.skosmos-widget-bibbikatalog').length) {
            $('.skosmos-widget-bibbikatalog').replaceWith(rendered);
        } else {
            $('.content').append(rendered);
        }

        // Add click handlers
        $('.skosmos-widget-bibbikatalog a.back-link').on('click', (evt) => {
            console.log('CLICK BACK', evt);
            evt.preventDefault();
            this.render(this.listContext);
        });

        $('.skosmos-widget-bibbikatalog a').on('click', (evt) => {
            console.log('CLICK', evt);
            const bibbiId = $(evt.currentTarget).data('bibbi-id');
            if (bibbiId) {
                const doc = this.cache[bibbiId];
                console.log('View doc', doc, this);
                evt.preventDefault();

                this.render({
                    doc: doc,
                    total_docs: this.listContext.total_docs,
                });
            }

        });
    },

};

$(function() {
	// Called on page load
	window.bibbiKatalogWidget = function(data) {
        // Only activating the widget when on a concept page and there is a prefLabel.
        if (data.page !== 'page' || data.prefLabels === undefined) {
            return;
        }
        BIBBI.query(data.uri)
	};
});
