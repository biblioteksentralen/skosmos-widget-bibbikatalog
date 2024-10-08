// declaring a namespace for the plugin
var BIBBI = BIBBI || {};

function formatIsbdTitle(title, parallelTitles) {
  const { mainTitle, subtitle, partNumber, partTitle } = title ?? {};
  return (
    mainTitle +
    (subtitle ? ` : ${subtitle}` : "") +
    (partNumber ? `. ${partNumber}` : "") +
    (partTitle ? `. ${partTitle}` : "") +
    (parallelTitles ?? []).map(
      (parallelTitle) =>
        " = " +
        parallelTitle.mainTitle +
        (parallelTitle.subtitle ? ` : ${parallelTitle.subtitle}` : "") +
        (parallelTitle.partNumber ? `. ${parallelTitle.partNumber}` : "") +
        (parallelTitle.partTitle ? `. ${parallelTitle.partTitle}` : "")
    )
  );
}

const parsePublicationYear = (publicationYear) =>
  parseInt(publicationYear ?? "") || 0;

const sortByPublicationYearDesc = (manifestations) =>
  manifestations.sort(
    (a, b) =>
      parsePublicationYear(b.publicationYear) -
      parsePublicationYear(a.publicationYear)
  );

const getFirstWorkPublicationYear = (work) =>
  parsePublicationYear(
    sortByPublicationYearDesc(
      work.expressions.flatMap(({ manifestations }) => manifestations)
    )[0]?.publicationYear
  );

const getWorkYearOrFirstPublicationYear = (work) =>
  work.workYear ?? getFirstWorkPublicationYear(work);

const mapContributor = (contributor) => ({
  id: contributor.agent.id,
  label: contributor.agent.name.nb,
  role: contributor.roles.map((role) => role.label.nb).join(", "),
  classname: contributor.agent.type.toLowerCase(),
  isMainContributor: contributor.isMainContributor,
});

BIBBI = {
  endpoint: "https://search.data.bs.no/cordata/global/api/work/search",

  cache: {},

  listContext: {},

  query: function (uri) {

    const bibbiAuthorityId = uri.split("/").pop();
    if (!bibbiAuthorityId) return;

    this.render({
      loading: true,
    });

    $.ajax({
      url: `${this.endpoint}?filter[bmdb.bibbiAuthorityId]=${bibbiAuthorityId}&size=100&version=0.6.1`,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Client-Identifier": "Vokabulartjenesten/Skosmos (drift@bibsent.no)",
      },
    })
      .fail((err) => {
        this.render({
          error:
            "Kan ikke vise resultater fra Bibbi katalog akkurat nå på grunn av en feil.",
        });
      })
      .done((res) => {
        console.info("Request successful", res);

        const total = res.total;

        // const skipRoles = ["manusforf.", "skuesp.", "overs.", "regissør"];
        // const sortOrder = ["genre", "topic", "creator"];

        const works = res.results
          .map((result) => {
            const work = result.work;
            const contributors = work.contributors.map(mapContributor);

            const mainCreator = contributors.find(
              (contributor) => contributor.isMainContributor
            );

            const subjects = work.subjects.map((authority) => ({
              id: authority.id,
              label: authority.name.nb,
              classname: authority.focus?.type?.toLowerCase() ?? "topic",
            }));

            const genres = work.genres.map((authority) => ({
              id: authority.id,
              label: authority.name.nb,
              classname: "genre",
            }));

            const title = formatIsbdTitle(work.title, []);

            const manifestations = work.expressions
              .flatMap((expression) =>
                expression.manifestations.map((manifestation) => ({
                  coverImage: manifestation.coverImage,
                  title: formatIsbdTitle(
                    manifestation.title,
                    manifestation.parallelTitles
                  ),
                  publicationYear: parsePublicationYear(
                    manifestation.publicationYear
                  ),
                  bibbiId: manifestation.identifiers.bibbiId,
                  isbn: manifestation.isbn ?? [],
                  ean: manifestation.ean ?? [],
                  statementOfResponsibility:
                    manifestation.statementOfResponsibility,
                  documentType: manifestation.documentType?.format,

                  contributors: [
                    ...(expression.contributors ?? []),
                    ...(manifestation.contributors ?? []),
                  ].map(mapContributor),
                }))
              )
              .sort(
                (work1, work2) => work2.publicationYear - work1.publicationYear
              );

            const images = manifestations
              .map((manifestation) => manifestation.coverImage)
              .filter((url) => typeof url === "string");

            return {
              id: work.id,
              mainCreator,
              title,
              coverImage: images[0],
              workYear: work.workYear,
              workYearOrFirstPublicationYear:
                getWorkYearOrFirstPublicationYear(work),
              contributors,
              subjects,
              genres,
              manifestations,
            };
          })
          .sort(
            (work1, work2) =>
              work2.workYearOrFirstPublicationYear -
              work1.workYearOrFirstPublicationYear
          );

        works.forEach((work) => {
          this.cache[work.id] = work;
        });

        console.log("Works", works);

        const groups = [
          {
            heading: "Bruk i Bibbi-katalogen",
            works: works,
            totalWorks: works.length,
          }, // (1) Make it work...
        ];

        this.listContext = {
          uri: uri,
          groups: groups,
          totalWorks: works.length,
        };

        this.render(this.listContext);
      });
  },

  render: function (context) {
    console.info("Render");
    const source = $("#skosmos-widget-bibbikatalog-template").html();
    const template = Handlebars.compile(source);
    const rendered = template(context);
    if ($(".skosmos-widget-bibbikatalog").length) {
      $(".skosmos-widget-bibbikatalog").replaceWith(rendered);
    } else {
      $(".content").append(rendered);
    }

    // Add click handlers
    $(".skosmos-widget-bibbikatalog a.back-link").on("click", (evt) => {
      evt.preventDefault();
      this.render(this.listContext);
    });

    $(".skosmos-widget-bibbikatalog a").on("click", (evt) => {
      const bibbiId = $(evt.currentTarget).data("bibbi-id");
      if (bibbiId) {
        const selectedWork = this.cache[bibbiId];
        console.log("View work", selectedWork, this);
        evt.preventDefault();

        this.render({
          selectedWork: selectedWork,
          totalWorks: this.listContext.totalWorks,
        });
      }
    });
  },
};

$(function () {
  // Called on page load
  window.bibbiKatalogWidget = function (data) {
    // Only activating the widget when on a concept page and there is a prefLabel.
    if (data.page !== "page" || data.prefLabels === undefined) {
      return;
    }
    BIBBI.query(data.uri);
  };
});
