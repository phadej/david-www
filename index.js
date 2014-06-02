var express = require("express")
var compress = require("compression")
var consolidate = require("consolidate")
var stats = require("./stats")
var manifest = require("./manifest")
var statics = require("./statics")
var brains = require("./brains")
var errors = require("./errors")
var graph = require("./graph")
var feed = require("./feed")
var profile = require("./profile")
var newsFeed = require("./news-feed")
var search = require("./search")
var changelog = require("./changelog")

var app = express()

app.engine("html", consolidate.handlebars)
app.set("view engine", "html")
app.set("views", __dirname + "/dist")
app.use(compress())

statics.init(app)

app.get("/news/rss.xml",                       newsRssFeed)
app.get("/dependency-counts.json",             dependencyCounts)
app.get("/stats",                              statsPage)
app.get("/search",                             searchPage)
app.get("/search.json",                        searchQuery)
app.get("/package/:pkg/changes.json",          changes)
app.get("/:user/:repo/dev-info.json",          devInfo)
app.get("/:user/:repo/peer-info.json",         peerInfo)
app.get("/:user/:repo/optional-info.json",     optionalInfo)
app.get("/:user/:repo/graph.json",             dependencyGraph)
app.get("/:user/:repo/dev-graph.json",         devDependencyGraph)
app.get("/:user/:repo/peer-graph.json",        peerDependencyGraph)
app.get("/:user/:repo/optional-graph.json",    optionalDependencyGraph)
app.get("/:user/:repo/rss.xml",                rssFeed)
app.get("/:user/:repo/dev-rss.xml",            devRssFeed)
app.get("/:user/:repo/status.png",             statusBadge)
app.get("/:user/:repo/status@2x.png",          retinaStatusBadge)
app.get("/:user/:repo/status.svg",             svgStatusBadge)
app.get("/:user/:repo/dev-status.png",         devStatusBadge)
app.get("/:user/:repo/dev-status@2x.png",      retinaDevStatusBadge)
app.get("/:user/:repo/dev-status.svg",         svgDevStatusBadge)
app.get("/:user/:repo/peer-status.png",        peerStatusBadge)
app.get("/:user/:repo/peer-status@2x.png",     retinaPeerStatusBadge)
app.get("/:user/:repo/peer-status.svg",        svgPeerStatusBadge)
app.get("/:user/:repo/optional-status.png",    optionalStatusBadge)
app.get("/:user/:repo/optional-status@2x.png", retinaOptionalStatusBadge)
app.get("/:user/:repo/optional-status.svg",    svgOptionalStatusBadge)
app.get("/:user/:repo@2x.png",                 retinaStatusBadge)
app.get("/:user/:repo.svg",                    svgStatusBadge)
app.get("/:user/:repo.png",                    statusBadge)
app.get("/:user/:repo",                        statusPage)
app.get("/:user",                              profilePage)
app.get("/",                                   indexPage)

/**
 * Do a home page
 */
function indexPage (req, res) {
  res.render("index", {
    recentlyRetrievedManifests: stats.getRecentlyRetrievedManifests(),
    recentlyUpdatedPackages: stats.getRecentlyUpdatedPackages()
  })
}

/**
 * Show pretty graphs and gaudy baubles
 */
function statsPage (req, res) {
  res.render("stats", {
    recentlyUpdatedPackages: stats.getRecentlyUpdatedPackages(),
    recentlyRetrievedManifests: stats.getRecentlyRetrievedManifests(),
    recentlyUpdatedManifests: stats.getRecentlyUpdatedManifests()
  })
}

function dependencyCounts (req, res) {
  res.json(stats.getDependencyCounts())
}

function newsRssFeed (req, res) {
  newsFeed.get(function (er, xml) {
    if (errors.happened(er, req, res, "Failed to get news feed xml")) {
      return
    }

    res.contentType("application/rss+xml")
    res.send(xml, 200)
  })
}

/**
 * Send the status badge for this user and repository
 */
function statusPage (req, res) {
  withManifestAndInfo(req, res, function (manifest, info) {
    res.render("status", {
      user: req.params.user,
      repo: req.params.repo,
      manifest: manifest,
      info: info
    })
  })
}

function profilePage (req, res) {
  profile.get(req.params.user, function (er, data) {
    if (errors.happened(er, req, res, "Failed to get profile data")) {
      return
    }

    res.render("profile", {user: req.params.user, repos: data})
  })
}

function searchPage (req, res) {
  res.render("search", {q: req.query.q})
}

function searchQuery (req, res) {
  search(req.query.q, function (er, results) {
    if (errors.happened(er, req, res, "Failed to get search results")) {
      return
    }

    res.json(results)
  })
}

function changes (req, res) {
  changelog.getChanges(req.params.pkg, req.query.from, req.query.to, function (er, changes) {
    if (er) {
      console.warn(er)
      return res.status(500).send({er: "Failed to get changes"})
    }
    res.send(changes)
  })
}

function getDepsType (opts) {
  var type = ""

  if (opts.dev) {
    type = "dev"
  } else if (opts.peer) {
    type = "peer"
  } else if (opts.optional) {
    type = "optional"
  }

  return type
}

function badgePath (depsType, status, retina, extension) {
  return "dist/img/status/" + (depsType ? depsType + "-" : "") + status + (retina ? "@2x" : "") + "." + (extension === "png" ? "png" : "svg")
}

/**
 * Send the status badge for this user and repository
 */
function sendStatusBadge (req, res, opts) {
  opts = opts || {}

  res.setHeader("Cache-Control", "no-cache")

  manifest.getManifest(req.params.user, req.params.repo, function (err, manifest) {
    if (err) {
      return res.status(404).sendfile("dist/img/status/unknown." + (opts.extension === "png" ? "png" : "svg"))
    }

    brains.getInfo(manifest, opts, function (err, info) {
      if (err) {
        return res.status(500).sendfile("dist/img/status/unknown." + (opts.extension === "png" ? "png" : "svg"))
      }

      res.sendfile(badgePath(getDepsType(opts), info.status, opts.retina, opts.extension))
    })
  })
}

function statusBadge (req, res) {
  sendStatusBadge(req, res, {extension: "png"})
}

function svgStatusBadge (req, res) {
  sendStatusBadge(req, res, {extension: "svg"})
}

function retinaStatusBadge (req, res) {
  sendStatusBadge(req, res, {retina: true, extension: "png"})
}

function devStatusBadge (req, res) {
  sendStatusBadge(req, res, {dev: true, extension: "png"})
}

function svgDevStatusBadge (req, res) {
  sendStatusBadge(req, res, {dev: true, extension: "svg"})
}

function retinaDevStatusBadge (req, res) {
  sendStatusBadge(req, res, {dev: true, retina: true, extension: "png"})
}

function peerStatusBadge (req, res) {
  sendStatusBadge(req, res, {peer: true, extension: "png"})
}

function svgPeerStatusBadge (req, res) {
  sendStatusBadge(req, res, {peer: true, extension: "svg"})
}

function retinaPeerStatusBadge (req, res) {
  sendStatusBadge(req, res, {peer: true, retina: true, extension: "png"})
}

function optionalStatusBadge (req, res) {
  sendStatusBadge(req, res, {optional: true, extension: "png"})
}

function svgOptionalStatusBadge (req, res) {
  sendStatusBadge(req, res, {optional: true, extension: "svg"})
}

function retinaOptionalStatusBadge (req, res) {
  sendStatusBadge(req, res, {optional: true, retina: true, extension: "png"})
}

function sendDependencyGraph (req, res, opts) {
  manifest.getManifest(req.params.user, req.params.repo, function (er, manifest) {
    if (errors.happened(er, req, res, "Failed to get package.json")) {
      return
    }

    var depsType = getDepsType(opts)
      , deps

    if (depsType) {
      deps = manifest[depsType + "Dependencies"] || {}
    } else {
      deps = manifest.dependencies || {}
    }

    graph.getProjectDependencyGraph(
      req.params.user + "/" + req.params.repo + (depsType ? "#" + depsType : ""),
      manifest.version,
      deps,
      function (er, graph) {
        if (errors.happened(er, req, res, "Failed to get graph data")) {
          return
        }

        res.json(graph)
      })
  })
}

function dependencyGraph (req, res) {
  sendDependencyGraph(req, res, {})
}

function devDependencyGraph (req, res) {
  sendDependencyGraph(req, res, {dev: true})
}

function peerDependencyGraph (req, res) {
  sendDependencyGraph(req, res, {peer: true})
}

function optionalDependencyGraph (req, res) {
  sendDependencyGraph(req, res, {optional: true})
}

function buildRssFeed (req, res, dev) {
  manifest.getManifest(req.params.user, req.params.repo, function (er, manifest) {
    if (errors.happened(er, req, res, "Failed to get package.json")) {
      return
    }

    feed.get(manifest, {dev: dev}, function (er, xml) {
      if (errors.happened(er, req, res, "Failed to build RSS XML")) {
        return
      }

      res.contentType("application/rss+xml")
      res.send(xml, 200)
    })
  })
}

function rssFeed (req, res) {
  buildRssFeed(req, res, false)
}

function devRssFeed (req, res) {
  buildRssFeed(req, res, true)
}

function devInfo (req, res) {
  withManifestAndInfo(req, res, {dev: true}, function (manifest, info) {
    res.json(info)
  })
}

function peerInfo (req, res) {
  withManifestAndInfo(req, res, {peer: true}, function (manifest, info) {
    res.json(info)
  })
}

function optionalInfo (req, res) {
  withManifestAndInfo(req, res, {optional: true}, function (manifest, info) {
    res.json(info)
  })
}

/**
 * Common callback boilerplate of getting a manifest and info for the status page and badge
 */
function withManifestAndInfo (req, res, opts, cb) {
  // Allow callback to be passed as third parameter
  if (!cb) {
    cb = opts
    opts = {}
  } else {
    opts = opts || {}
  }

  manifest.getManifest(req.params.user, req.params.repo, function (er, manifest) {
    if (errors.happened(er, req, res, "Failed to get package.json")) {
      return
    }

    brains.getInfo(manifest, opts, function (er, info) {
      if (errors.happened(er, req, res, "Failed to get dependency info")) {
        return
      }

      cb(manifest, info)
    })
  })
}

app.use(function (req, res) {
  res.status(404)

  // respond with html page
  if (req.accepts("html")) {
    return res.render("404")
  }

  // respond with json
  if (req.accepts("json")) {
    return res.send({er: "Not found"})
  }

  // default to plain-text. send()
  res.type("txt").send("Not found")
})

var port = process.env.PORT || 1337

app.listen(port)

process.title = "david:" + port

console.log("David listening on port", port)
