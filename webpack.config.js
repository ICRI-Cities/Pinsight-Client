var webpack = require('webpack');


module.exports = {
	devtool: 'inline-source-map',
	debug: true,
	entry: './public/js/src/index.js',
	output: {
		path: "./public/js",
		filename: "bundle.js",
		publicPath: "js"
	},
	module: {
		loaders: [
		{
			test: /\.js$/,
			exclude: /(node_modules)/,
			loader: ["babel-loader"],
			query: {
				presets: ["latest", "stage-0", "react"]
			}
		}
		]
	}
};