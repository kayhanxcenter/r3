import MyBuilderAttribute          from './builderAttribute.js';
import MyBuilderCaption            from './builderCaption.js';
import MyBuilderPreset             from './builderPreset.js';
import MyBuilderPgIndex            from './builderPgIndex.js';
import MyBuilderPgTriggers         from './builderPgTriggers.js';
import MyBuilderPresets            from './builderPresets.js';
import MyCodeEditor                from '../codeEditor.js';
import MyInputDecimal              from '../inputDecimal.js';
import MyInputOffset               from '../inputOffset.js';
import {getTemplateRelationPolicy} from '../shared/builderTemplate.js';
import {dialogDeleteAsk}           from '../shared/dialog.js';
import {srcBase64}                 from '../shared/image.js';
import {
	getAttributeIcon,
	isAttributeDecimal,
	isAttributeFiles,
	isAttributeInteger,
	isAttributeRelationship,
	isAttributeRelationship11,
	isAttributeString,
	isAttributeUuid,
	isAttributeWithLength
} from '../shared/attribute.js';
import {
	getDependentModules,
	getDependentAttributes
} from '../shared/builder.js';
import {
	copyValueDialog,
	deepIsEqual
} from '../shared/generic.js';

const MyBuilderRelationsItemPolicy = {
	name:'my-builder-relations-item-policy',
	template:`<tr>
		<td><img v-if="!readonly" class="action dragAnchor" src="images/drag.png" /></td>
		<td>
			<select v-model="roleId" :disabled="readonly">
				<option v-for="r in module.roles" :value="r.id">{{ r.name }}</option>
				<optgroup
					v-for="mod in getDependentModules(module).filter(v => v.id !== module.id)"
					:label="mod.name"
				>
					<option v-for="r in mod.roles" :value="r.id">{{ r.name }}</option>
				</optgroup>
			</select>
		</td>
		<td><my-bool v-model="actionSelect" :readonly="readonly" /></td>
		<td><my-bool v-model="actionUpdate" :readonly="readonly" /></td>
		<td><my-bool v-model="actionDelete" :readonly="readonly" /></td>
		<td>
			<select v-model="pgFunctionIdExcl" :disabled="readonly">
				<option :value="null">[{{ capApp.policyNotSet }}]</option>
				<option v-for="f in filterFunctions" :value="f.id">
					{{ f.name }}
				</option>
			</select>
		</td>
		<td>
			<select v-model="pgFunctionIdIncl" :disabled="readonly">
				<option :value="null">[{{ capApp.policyNotSet }}]</option>
				<option v-for="f in filterFunctions" :value="f.id">
					{{ f.name }}
				</option>
			</select>
		</td>
		<td>
			<my-button image="cancel.png"
				@trigger="$emit('remove')"
				:active="!readonly"
				:naked="true"
			/>
		</td>
	</tr>`,
	props:{
		modelValue:{ type:Object,  required:true },
		moduleId:  { type:String,  required:true },
		readonly:  { type:Boolean, required:true }
	},
	emits:['moveDown','moveUp','remove','update:modelValue'],
	computed:{
		filterFunctions() {
			// limit to integer array returns, as in: INTEGER[], bigint[], INT [] or integer ARRAY
			let pat = /^(integer|bigint|int)(\s?\[\]|\sarray)$/i;
			let out = [];
			for(let i = 0, j = this.module.pgFunctions.length; i < j; i++) {
				let f = this.module.pgFunctions[i];
				
				if(pat.test(f.codeReturns))
					out.push(f);
			}
			return out;
		},
		
		// inputs
		actionDelete:{
			get()  { return this.modelValue.actionDelete; },
			set(v) { this.update('actionDelete',v); }
		},
		actionSelect:{
			get()  { return this.modelValue.actionSelect; },
			set(v) { this.update('actionSelect',v); }
		},
		actionUpdate:{
			get()  { return this.modelValue.actionUpdate; },
			set(v) { this.update('actionUpdate',v); }
		},
		pgFunctionIdExcl:{
			get()  { return this.modelValue.pgFunctionIdExcl; },
			set(v) { this.update('pgFunctionIdExcl',v); }
		},
		pgFunctionIdIncl:{
			get()  { return this.modelValue.pgFunctionIdIncl; },
			set(v) { this.update('pgFunctionIdIncl',v); }
		},
		roleId:{
			get()  { return this.modelValue.roleId; },
			set(v) { this.update('roleId',v); }
		},
		
		// stores
		module:s => s.$store.getters['schema/moduleIdMap'][s.moduleId],
		capApp:s => s.$store.getters.captions.builder.relation
	},
	methods:{
		// external
		getDependentModules,
		
		update(name,value) {
			let v = JSON.parse(JSON.stringify(this.modelValue));
			v[name] = value;
			
			this.$emit('update:modelValue',v);
		}
	}
};

export default {
	name:'my-builder-relation',
	components:{
		echarts:VueECharts,
		MyBuilderAttribute,
		MyBuilderCaption,
		MyBuilderPreset,
		MyBuilderPgIndex,
		MyBuilderPgTriggers,
		MyBuilderPresets,
		MyBuilderRelationsItemPolicy,
		MyCodeEditor,
		MyInputDecimal,
		MyInputOffset
	},
	template:`<div class="contentBox grow scroll">
		<div class="top lower nowrap">
			<div class="area">
				<img class="icon" src="images/database.png" />
				<h1 class="title">{{ capApp.titleOne.replace('{NAME}',relation.name) }}</h1>
			</div>
			<div class="area">
				<div class="row gap default-inputs" v-if="['attributes','presets'].includes(tabTarget)">
					<input v-model="nameFilter" :placeholder="capGen.threeDots" />
				</div>
			</div>
			<div class="area">
				<my-button image="visible1.png"
					@trigger="copyValueDialog(relation.name,relation.id,relation.id)"
					:caption="capGen.id"
				/>
				<my-button image="delete.png"
					@trigger="dialogDeleteAsk(del,capApp.dialog.delete)"
					:active="!readonly"
					:cancel="true"
					:caption="capGen.button.delete"
					:captionTitle="capGen.button.delete"
				/>
			</div>
		</div>

		<div class="content no-padding builder-relation">
			<my-tabs
				v-model="tabTarget"
				:entries="relationTabs"
				:entriesText="tabCaptions"
			/>
			
			<!-- attributes -->
			<div class="generic-entry-list tab-content" v-if="tabTarget === 'attributes'">
				<div class="entry"
					v-if="!relationReadonly"
					@click="attributeIdEdit = null"
					:class="{ clickable:!relationReadonly }"
				>
					<div class="row gap centered">
						<img class="icon" src="images/add.png" />
						<span>{{ capGen.button.new }}</span>
					</div>
				</div>
				
				<div class="entry clickable"
					@click="attributeIdEdit = atr.id"
					v-for="atr in relation.attributes.filter(v => nameFilter === '' || v.name.includes(nameFilter.toLowerCase()))"
				>
					<my-button
						:active="false"
						:captionTitle="capApp.attributeContent"
						:image="getAttributeIcon(atr.content,atr.contentUse,false,false)"
						:naked="true"
					/>
					<div class="lines">
						<span>{{ atr.name }}</span>
						<span class="subtitle" v-if="typeof atr.captions.attributeTitle[builderLanguage] !== 'undefined'">
							[{{ atr.captions.attributeTitle[builderLanguage] }}]
						</span>
					</div>
					<my-button image="lock.png"
						v-if="atr.encrypted"
						:active="false"
						:captionTitle="capApp.attributeEncrypted"
						:naked="true"
					/>
					<my-button
						v-if="isAttributeWithLength(atr.content) && atr.length !== 0"
						:active="false"
						:caption="'['+String(atr.length)+']'"
						:captionTitle="capApp.attributeLength"
						:naked="true"
					/>
					<my-button image="asterisk.png"
						v-if="!atr.nullable"
						:active="false"
						:captionTitle="capApp.attributeNotNullable"
						:naked="true"
					/>
					<my-button
						:active="false"
						:captionTitle="atr.iconId === null ? capApp.attributeNoIcon : capGen.icon"
						:image="atr.iconId === null ? 'icon_missing.png' : ''"
						:imageBase64="atr.iconId !== null ? srcBase64(iconIdMap[atr.iconId].file) : ''"
						:naked="true"
					/>
				</div>
				
				<!-- attribute dialog -->
				<my-builder-attribute
					v-if="attributeIdEdit !== false"
					@close="attributeIdEdit = false"
					@nextLanguage="$emit('nextLanguage')"
					@new-record="attributeIdEdit = null"
					:attributeId="attributeIdEdit"
					:builderLanguage
					:readonly="relationReadonly"
					:relation
				/>
			</div>

			<!-- properties -->
			<div class="contentBox" v-if="tabTarget === 'properties'">
				<div class="top lower">
					<div class="area">
						<my-button image="save.png"
							@trigger="set"
							:active="canSave"
							:caption="capGen.button.save"
							:captionTitle="capGen.button.save"
						/>
						<my-button image="refresh.png"
							@trigger="reset(true)"
							:active="isChanged"
							:caption="capGen.button.refresh"
						/>
					</div>
				</div>
				
				<div class="content default-inputs no-padding">
					<table class="generic-table-vertical default-inputs">
						<tbody>
							<tr>
								<td>{{ capGen.name }}</td>
								<td><input class="long" v-model="relation.name" :disabled="readonly || isViewUnmanaged" /></td>
								<td>{{ capApp.nameHint }}</td>
							</tr>
							<tr v-if="isView">
								<td>PostgreSQL view</td>
								<td>
									<div class="row gap centered">
										<my-button image="databasePlay.png"
											:active="false"
											:caption="relation.view.hasId ? 'with id' : 'no id'"
											:naked="true"
										/>
										<my-button image="codeDatabase.png"
											:active="false"
											:caption="relation.view.managed ? 'managed' : 'external'"
											:naked="true"
										/>
									</div>
								</td>
								<td>Read-only relation backed by a PostgreSQL view.</td>
							</tr>
							<tr>
								<td>{{ capGen.title }}</td>
								<td>
									<my-builder-caption
										v-model="relation.captions.relationTitle"
										:language="builderLanguage"
										:readonly
									/>
								</td>
								<td>{{ capApp.titleHint }}</td>
							</tr>
							<tr>
								<td>{{ capGen.comments }}</td>
								<td colspan="2">
									<textarea class="dynamic"
										@input="relation.comment = $event.target.value !== '' ? $event.target.value : null"
										:disabled="readonly"
										:value="relation.comment"
									></textarea>
								</td>
							</tr>
							<tr>
								<td>{{ capApp.recordTitle }}</td>
								<td>
									<div class="column gap">
										<select @input="recordTitleAttributeAdd($event.target.value)" :disabled="readonly" :value="recordTitleAttributeId">
											<option value="">[{{ capGen.button.add }}]</option>
											<option v-for="a in attributesRecordTitleCandidates" :value="a.id">{{ a.name }}</option>
										</select>
										<div class="row gap">
											<my-button image="delete.png"
												v-for="id in relation.attributeIdsTitle"
												@trigger="recordTitleAttributeRemove(id)"
												:active="!readonly"
												:caption="attributeIdMap[id].name"
												:naked="true"
											/>
										</div>
									</div>
								</td>
								<td v-html="capApp.recordTitleHint.join('<br /><br />')"></td>
							</tr>
							<tr>
								<td>{{ capApp.retention }}</td>
								<td>
									<table>
										<tbody>
											<tr>
												<td>{{ capApp.retentionCount }}</td>
												<td><my-input-decimal v-model="relation.retentionCount" :min="0" :allowNull="true" :lengthFract="0" :readonly="readonly || isView" /></td>
											</tr>
											<tr>
												<td>{{ capApp.retentionDays }}</td>
												<td><my-input-decimal v-model="relation.retentionDays" :min="0" :allowNull="true" :lengthFract="0" :readonly="readonly || isView" /></td>
											</tr>
										</tbody>
									</table>
								</td>
								<td>{{ capApp.retentionHint }}</td>
							</tr>
							<tr>
								<td>{{ capApp.encryption }}</td>
								<td><my-bool v-model="relation.encryption" :readonly="true" /></td>
								<td>{{ capApp.encryptionHint }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
			
			<!-- indexes -->
			<div class="generic-entry-list tab-content" v-if="tabTarget === 'indexes'">
				<div class="entry"
					v-if="!relationReadonly"
					@click="indexIdEdit = null"
					:class="{ clickable:!relationReadonly }"
				>
					<div class="row gap centered">
						<img class="icon" src="images/add.png" />
						<span>{{ capGen.button.new }}</span>
					</div>
				</div>
				
				<div class="entry clickable"
					@click="indexIdEdit = ind.id"
					v-for="ind in relation.indexes"
				>
					<my-button image="databaseAsterisk.png"
						:active="false"
						:naked="true"
					/>
					<div class="lines"><span>{{ displayIndexName(ind) }}</span></div>
					<my-button image="asterisk.png"
						v-if="ind.noDuplicates"
						:active="false"
						:captionTitle="capApp.indexUnique"
						:naked="true"
					/>
					<my-button image="cogMultiple.png"
						v-if="ind.primaryKey || ind.autoFki"
						:active="false"
						:captionTitle="capApp.indexSystem"
						:naked="true"
					/>
					<my-button image="key.png"
						v-if="ind.primaryKey"
						:active="false"
						:captionTitle="capApp.indexPrimaryKey"
						:naked="true"
					/>
					<my-button
						v-if="ind.autoFki"
						:active="false"
						:captionTitle="capApp.indexAutoFki"
						:image="attributeIdMap[ind.attributes[0].attributeId].content === '1:1' ? 'link1.png' : 'link3.png'"
						:naked="true"
					/>
					<my-button image="languages.png"
						v-if="ind.method === 'GIN'"
						:active="false"
						:captionTitle="capApp.indexText"
						:naked="true"
					/>
				</div>
				
				<!-- index dialog -->
				<my-builder-pg-index
					v-if="indexIdEdit !== false"
					@close="indexIdEdit = false"
					:pgIndexId="indexIdEdit"
					:builderLanguage
					:readonly="relationReadonly"
					:relation
				/>
			</div>
			
			<!-- triggers -->
			<div class="tab-content" v-if="tabTarget === 'triggers'">
				<my-builder-pg-triggers :contextEntity="'relation'" :contextId="relation.id" :readonly="relationReadonly" />
			</div>
			
			<!-- presets -->
			<div class="tab-content" v-if="tabTarget === 'presets'">
				<my-builder-presets :filter="nameFilter" :relation :readonly="relationReadonly" />
			</div>
			
			<!-- policies -->
			<div class="tab-content" v-if="tabTarget === 'policies'">
				<table class="default-inputs">
					<thead v-if="relation.policies.length !== 0">
						<tr>
							<td></td>
							<td></td>
							<td colspan="3">{{ capApp.policyActions }}</td>
							<td colspan="2">{{ capApp.policyFunctions }}</td>
							<td colspan="2"></td>
						</tr>
						<tr>
							<td>{{ capGen.order }}</td>
							<td>{{ capGen.role }}</td>
							<td>{{ capApp.policyActionSelect }}</td>
							<td>{{ capApp.policyActionUpdate }}</td>
							<td>{{ capApp.policyActionDelete }}</td>
							<td>{{ capApp.policyFunctionExcl }}</td>
							<td>{{ capApp.policyFunctionIncl }}</td>
							<td colspan="2"></td>
						</tr>
					</thead>
					<draggable handle=".dragAnchor" tag="tbody" group="policies" itemKey="id" animation="100"
						:fallbackOnBody="true"
						:list="relation.policies"
					>
						<template #item="{element,index}">
							<my-builder-relations-item-policy
								@remove="relation.policies.splice(index,1)"
								@update:modelValue="relation.policies[index] = $event"
								:modelValue="element"
								:moduleId="relation.moduleId"
								:readonly
							/>
						</template>
					</draggable>
				</table>
				<p style="width:900px;" v-if="relation.policies.length !== 0">
					{{ capApp.policyExplanation }}
				</p>
				
				<div class="row gap">
					<my-button image="add.png"
						@trigger="addPolicy"
						:active="!readonly"
						:caption="capGen.button.add"
					/>
					<my-button image="save.png"
						@trigger="set"
						:active="!readonly && isChanged"
						:caption="capGen.button.save"
						:captionTitle="capGen.button.save"
					/>
				</div>
			</div>

			<!-- relationship graph -->
			<div class="tab-content graph" v-if="tabTarget === 'relationships'">
				<echarts
					@click="graphClicked"
					:autoresize="true"
					:option="graphOption"
					:theme="settings.dark ? 'dark' : ''"
				/>
			</div>
			
			<!-- data view -->
			<div class="tab-content builder-relation-preview default-inputs" v-if="tabTarget === 'data'">
				<div class="row gap centered space-between">
					<div class="row gap centered">
						<span>{{ capApp.previewLimit }}</span>
						<select class="short"
							v-model.number="previewLimit"
							@change="previewReload"
						>
							<option v-for="i in 10" :value="i*10">{{ i*10 }}</option>
						</select>
					</div>
					
					<my-input-offset
						@input="previewOffset = $event; getPreview()"
						:caption="true"
						:limit="previewLimit"
						:offset="previewOffset"
						:total="previewRowCount"
					/>
					
					<my-button image="refresh.png"
						@trigger="getPreview"
						:caption="capGen.button.refresh"
					/>
				</div>
				
				<div class="builder-relation-preview-data shade">
					<table>
						<thead>
							<tr><th v-for="a in attributesNotFiles">{{ a.name }}</th></tr>
						</thead>
						<tbody>
							<tr v-for="r in previewRows">
								<td v-for="v in r" :title="v">{{ displayDataValue(v) }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- SQL -->
			<div class="contentBox" v-if="tabTarget === 'sql'">
				<div class="top lower">
					<div class="area">
						<my-button image="save.png"
							@trigger="set"
							:active="canSaveSql"
							:caption="capGen.button.save"
							:captionTitle="capGen.button.save"
						/>
						<my-button image="refresh.png"
							@trigger="reset(true)"
							:active="isChanged"
							:caption="capGen.button.refresh"
						/>
					</div>
				</div>
				<div class="content default-inputs no-padding">
					<table class="generic-table-vertical default-inputs">
						<tbody>
							<tr>
								<td>Has stable id column</td>
								<td><my-bool v-model="relation.view.hasId" :readonly /></td>
								<td>Disable this when the view has no unique, non-null, stable id column.</td>
							</tr>
							<tr>
								<td>Managed SQL</td>
								<td><my-bool v-model="relation.view.managed" :readonly /></td>
								<td>Managed views are created or replaced by REI3 from this SQL.</td>
							</tr>
							<tr>
								<td>SQL</td>
								<td colspan="2">
									<div class="view-query-designer" v-if="relation.view.managed && isViewQuery">
										<div class="view-definition-row">
											<span>Base relation</span>
											<select v-model="relation.view.definition.baseRelationId" :disabled="readonly" @change="resetViewDefinition">
												<option v-for="r in viewDefinitionBaseRelations" :value="r.id">{{ r.name }}</option>
											</select>
										</div>
										<div class="view-definition-section">
											<div class="view-definition-header">
												<span>Joins</span>
												<my-button image="add.png"
													@trigger="addViewDefinitionJoin"
													:active="!readonly && viewDefinitionCanAddJoin"
													:captionTitle="'Add join'"
												/>
											</div>
											<div class="view-definition-list">
												<div class="view-definition-item" v-for="(join,i) in relation.view.definition.joins">
													<select v-model="join.relationId" :disabled="readonly" @change="resetViewDefinitionJoin(i)">
														<option v-for="r in viewDefinitionJoinRelations(i)" :value="r.id">{{ r.name }}</option>
													</select>
													<select v-model="join.attributeId" :disabled="readonly">
														<option v-for="a in viewDefinitionJoinAttributes(join,i)" :value="a.id">{{ viewDefinitionJoinAttributeLabel(a) }}</option>
													</select>
													<div class="view-definition-check">
														<span>Required</span>
														<my-bool v-model="join.required" :readonly />
													</div>
													<my-button image="delete.png"
														@trigger="removeViewDefinitionJoin(i)"
														:active="!readonly"
														:captionTitle="'Remove join'"
													/>
												</div>
											</div>
										</div>
										<div class="view-definition-section">
											<div class="view-definition-header">
												<span>Columns</span>
												<my-button image="add.png"
													@trigger="addViewDefinitionColumn"
													:active="!readonly && viewDefinitionCanAddColumn"
													:captionTitle="'Add column'"
												/>
											</div>
											<div class="view-definition-list">
												<div class="view-definition-item column" v-for="(column,i) in relation.view.definition.columns">
													<select v-model="column.relationId" :disabled="readonly" @change="resetViewDefinitionColumn(i)">
														<option v-for="r in viewDefinitionColumnRelations" :value="r.id">{{ r.name }}</option>
													</select>
													<select v-model="column.attributeId" :disabled="readonly" @change="fillViewDefinitionColumnAlias(column)">
														<option v-for="a in viewDefinitionColumnAttributes(column)" :value="a.id">{{ a.name }}</option>
													</select>
													<select v-model="column.function" :disabled="readonly" @change="viewDefinitionColumnFunctionChanged(column)">
														<option v-for="f in viewDefinitionColumnFunctions(column)" :value="f.value">{{ f.label }}</option>
													</select>
													<select v-model="column.aggregate" :disabled="readonly" @change="fillViewDefinitionColumnAlias(column)">
														<option value="">Value</option>
														<option value="sum">SUM</option>
														<option value="count">COUNT</option>
														<option value="avg">AVG</option>
														<option value="min">MIN</option>
														<option value="max">MAX</option>
													</select>
													<input v-model="column.fallback" :disabled="readonly || column.function !== 'coalesce'" placeholder="fallback" />
													<input v-model="column.alias" :disabled="readonly" placeholder="alias" />
													<my-button image="delete.png"
														@trigger="removeViewDefinitionColumn(i)"
														:active="!readonly"
														:captionTitle="'Remove column'"
													/>
												</div>
											</div>
										</div>
										<div class="view-definition-section">
											<div class="view-definition-header">
												<span>Filters</span>
												<my-button image="add.png"
													@trigger="addViewDefinitionFilter"
													:active="!readonly && viewDefinitionCanAddFilter"
													:captionTitle="'Add filter'"
												/>
											</div>
											<div class="view-definition-list">
												<div class="view-definition-item condition" v-for="(filter,i) in relation.view.definition.filters || []">
													<select v-model="filter.connector" :disabled="readonly || i === 0">
														<option value="AND">AND</option>
														<option value="OR">OR</option>
													</select>
													<select v-model="filter.relationId" :disabled="readonly" @change="resetViewDefinitionFilter(i)">
														<option v-for="r in viewDefinitionColumnRelations" :value="r.id">{{ r.name }}</option>
													</select>
													<select v-model="filter.attributeId" :disabled="readonly" @change="viewDefinitionColumnFunctionChanged(filter)">
														<option v-for="a in viewDefinitionColumnAttributes(filter)" :value="a.id">{{ a.name }}</option>
													</select>
													<select v-model="filter.function" :disabled="readonly" @change="viewDefinitionColumnFunctionChanged(filter)">
														<option v-for="f in viewDefinitionColumnFunctions(filter)" :value="f.value">{{ f.label }}</option>
													</select>
													<select v-model="filter.operator" :disabled="readonly">
														<option v-for="o in viewDefinitionConditionOperators" :value="o.value">{{ o.label }}</option>
													</select>
													<input v-model="filter.value" :disabled="readonly || viewDefinitionOperatorNeedsNoValue(filter.operator)" placeholder="value" />
													<input v-model="filter.fallback" :disabled="readonly || filter.function !== 'coalesce'" placeholder="fallback" />
													<my-button image="delete.png"
														@trigger="removeViewDefinitionFilter(i)"
														:active="!readonly"
														:captionTitle="'Remove filter'"
													/>
												</div>
											</div>
										</div>
										<div class="view-definition-section">
											<div class="view-definition-header">
												<span>Having</span>
												<my-button image="add.png"
													@trigger="addViewDefinitionHaving"
													:active="!readonly && viewDefinitionCanAddHaving"
													:captionTitle="'Add having condition'"
												/>
											</div>
											<div class="view-definition-list">
												<div class="view-definition-item having" v-for="(having,i) in relation.view.definition.havings || []">
													<select v-model="having.connector" :disabled="readonly || i === 0">
														<option value="AND">AND</option>
														<option value="OR">OR</option>
													</select>
													<select v-model="having.columnAlias" :disabled="readonly">
														<option v-for="c in viewDefinitionOutputColumns" :value="c.alias">{{ c.alias }}</option>
													</select>
													<select v-model="having.operator" :disabled="readonly">
														<option v-for="o in viewDefinitionConditionOperators" :value="o.value">{{ o.label }}</option>
													</select>
													<input v-model="having.value" :disabled="readonly || viewDefinitionOperatorNeedsNoValue(having.operator)" placeholder="value" />
													<my-button image="delete.png"
														@trigger="removeViewDefinitionHaving(i)"
														:active="!readonly"
														:captionTitle="'Remove having condition'"
													/>
												</div>
											</div>
										</div>
										<div class="view-definition-section">
											<div class="view-definition-header">
												<span>Order</span>
												<my-button image="add.png"
													@trigger="addViewDefinitionOrder"
													:active="!readonly && viewDefinitionCanAddOrder"
													:captionTitle="'Add order'"
												/>
											</div>
											<div class="view-definition-list">
												<div class="view-definition-item order" v-for="(order,i) in relation.view.definition.orders || []">
													<select v-model="order.columnAlias" :disabled="readonly">
														<option v-for="c in viewDefinitionOutputColumns" :value="c.alias">{{ c.alias }}</option>
													</select>
													<select v-model="order.direction" :disabled="readonly">
														<option value="ASC">ASC</option>
														<option value="DESC">DESC</option>
													</select>
													<my-button image="delete.png"
														@trigger="removeViewDefinitionOrder(i)"
														:active="!readonly"
														:captionTitle="'Remove order'"
													/>
												</div>
											</div>
										</div>
										<div class="view-token-preview">
											Generated SQL
										</div>
									</div>
									<div class="column gap" v-if="relation.view.managed && !isViewQuery">
										<div class="view-token-picker">
											<select v-model="viewTokenKind" :disabled="readonly">
												<option value="REL">Relation</option>
												<option value="ATR">Attribute</option>
												<option value="PGF">PG function</option>
											</select>
											<select v-model="viewTokenModuleId" :disabled="readonly">
												<option v-for="m in modules" :value="m.id">{{ m.name }}</option>
											</select>
											<select
												v-if="['REL','ATR'].includes(viewTokenKind)"
												v-model="viewTokenRelationId"
												:disabled="readonly"
											>
												<option v-for="r in viewTokenRelations" :value="r.id">{{ r.name }}</option>
											</select>
											<select
												v-if="viewTokenKind === 'ATR'"
												v-model="viewTokenAttributeId"
												:disabled="readonly"
											>
												<option v-for="a in viewTokenAttributes" :value="a.id">{{ a.name }}</option>
											</select>
											<select
												v-if="viewTokenKind === 'PGF'"
												v-model="viewTokenPgFunctionId"
												:disabled="readonly"
											>
												<option v-for="f in viewTokenPgFunctions" :value="f.id">{{ f.name }}</option>
											</select>
											<my-button image="add.png"
												@trigger="appendPickedViewSqlToken"
												:active="!readonly && viewTokenCanInsert"
												:captionTitle="'Insert token'"
											/>
										</div>
										<div class="view-token-preview" v-if="viewTokenPreview !== ''">
											{{ viewTokenPreview }}
										</div>
									</div>
									<div class="view-sql-editor">
										<my-code-editor
											v-model="viewSql"
											mode="pgsql"
											:readonly="readonly || !relation.view.managed || isViewQuery"
										/>
									</div>
								</td>
							</tr>
							<tr v-if="relation.view.managed && viewSqlResolved !== '' && viewSqlResolved !== viewSql">
								<td>Resolved SQL</td>
								<td colspan="2">
									<div class="view-sql-editor resolved">
										<my-code-editor
											:modelValue="viewSqlResolved"
											mode="pgsql"
											:readonly="true"
										/>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>`,
	props:{
		builderLanguage:{ type:String,  required:true },
		id:             { type:String,  required:true },
		readonly:       { type:Boolean, required:true }
	},
	emits:['createNew','nextLanguage'],
	watch:{
		relationSchema:{
			handler() { this.reset(false); },
			immediate:true
		},
		tabTarget(vNew,vOld) {
			if(vNew === 'data')
				this.getPreview();
		},
		viewTokenKind() {
			this.resetViewTokenPicker();
		},
		viewTokenModuleId() {
			this.viewTokenRelationId   = '';
			this.viewTokenAttributeId  = '';
			this.viewTokenPgFunctionId = '';
			this.resetViewTokenPicker();
		},
		viewTokenRelationId() {
			this.viewTokenAttributeId = '';
			this.resetViewTokenPicker();
		}
	},
	data() {
		return {
			// inputs
			relation:false,  // relation being edited in this component
			relationCopy:{}, // copy of relation from schema when component last reset

			// states
			attributeIdEdit:false,
			indexIdEdit:false,
			nameFilter:'',
			previewLimit:50,
			previewOffset:0,
			previewRows:[],
			previewRowCount:0,
			previewValueLength:50,
			recordTitleAttributeId:'',
			tabTarget:'attributes',
			viewTokenAttributeId:'',
			viewTokenKind:'REL',
			viewTokenModuleId:'',
			viewTokenPgFunctionId:'',
			viewTokenRelationId:''
		};
	},
	mounted() {
		window.addEventListener('keydown',this.handleHotkeys);
	},
	unmounted() {
		window.removeEventListener('keydown',this.handleHotkeys);
	},
	computed:{
		attributesRecordTitleCandidates:s => {
			let out = [];
			for(const a of s.relation.attributes) {
				if(!s.relation.attributeIdsTitle.includes(a.id) && a.contentUse === 'default' && (
						s.isAttributeString(a.content) || s.isAttributeDecimal(a.content) ||
						s.isAttributeInteger(a.content) || s.isAttributeUuid(a.content)
					)
				) {
					out.push(a);
				}
			}
			return out;
		},
		tabCaptions:s => {
			let triggerCnt = 0;
			for(const mod of s.modules) {
				triggerCnt += mod.pgTriggers.filter(trg => trg.relationId === s.id).length;
			}

			if(s.isView) {
				return [
					s.capApp.attributes.replace('{CNT}',s.relation.attributes.length),
					s.capGen.properties,
					s.capApp.policies.replace('{CNT}',s.relation.policies.length),
					s.capApp.preview,
					'SQL'
				];
			}

			return [
				s.capApp.attributes.replace('{CNT}',s.relation.attributes.length),
				s.capGen.properties,
				s.capApp.indexes.replace('{CNT}',s.relation.indexes.length),
				s.capApp.triggers.replace('{CNT}',triggerCnt),
				s.capApp.presets.replace('{CNT}',s.relation.presets.length),
				s.capApp.policies.replace('{CNT}',s.relation.policies.length),
				s.capApp.graph,
				s.capApp.preview
			];
		},
		relationTabs:s => s.isView
			? ['attributes','properties','policies','data','sql']
			: ['attributes','properties','indexes','triggers','presets','policies','relationships','data'],

		// relationship graph
		graphOption:s => {
			let edges = [];
			let nodes = [{ // base relation
				id:s.relation.id,
				name:s.relation.name,
				category:0,
				label:{ show:true },
				r3:{ relationId:null },
				symbolSize:50,
				value:''
			}];
			
			// relationships to and from base relation
			for(const a of s.getDependentAttributes(s.moduleIdMap[s.relation.moduleId])) {
				if(!s.isAttributeRelationship(a.content))
					continue;
				
				// relationship to or from base relation
				if(a.relationshipId !== s.relation.id && a.relationId !== s.relation.id)
					continue;
				
				let relIn = a.relationshipId === s.relation.id;
				let rSource = relIn ? s.relationIdMap[a.relationshipId] : s.relationIdMap[a.relationId];
				let rTarget = relIn ? s.relationIdMap[a.relationId] : s.relationIdMap[a.relationshipId];
				
				let category = 1;
				if(!s.isAttributeRelationship11(a.content))
					category = relIn ? 3 : 2;
				
				let external = rTarget.moduleId !== s.relation.moduleId;
				
				nodes.push({
					id:relIn ? `${rTarget.id}.${a.id}` : `${rSource.id}.${a.id}`,
					name:external ? `${s.moduleIdMap[rTarget.moduleId].name}.${rTarget.name}` : rTarget.name,
					category:category,
					label:{ show:true },
					r3:{ relationId:rTarget.id },
					symbolSize:30,
					value:relIn ? a.name : `${rSource.name}: ${a.name}`
				});
				edges.push({
					'source':relIn ? `${rTarget.id}.${a.id}` : `${rSource.id}`,
					'target':relIn ? `${rSource.id}` : `${rSource.id}.${a.id}`
				});
			}
			let categories = [
				{name:s.capApp.graphBase},
				{name:'1:1'},
				{name:'n:1'},
				{name:'1:n'}
			];
			
			return {
				backgroundColor:'transparent',
				label: { position:'right' },
				legend:[{
					data:categories.map(function(a) { return a.name; })
				}],
				series:[{
					categories:categories,
					data:nodes,
					edges:edges,
					edgeSymbol:['none','arrow'],
					emphasis: { focus:'adjacency' },
					force:{
						edgeLength:150,
						gravity:0,
						layoutAnimation:true,
						repulsion:150
					},
					layout:'force',
					lineStyle:{
						color:'source',
						width:3
					},
					roam:true, // user move/zoom
					type:'graph'
				}],
				tooltip:{} // must be set
			};
		},

		// simple
		attributesNotFiles:s => s.relation === false ? [] : s.relation.attributes.filter(v => !s.isAttributeFiles(v.content)),
		canSave:           s => s.relation.name !== '' && !s.readonly && s.isChanged,
		canSaveSql:        s => s.isView && !s.readonly && s.isChanged && (!s.relation.view.managed || (s.isViewQuery ? s.viewDefinitionValid : s.viewSql !== '')),
		isChanged:         s => !s.deepIsEqual(s.relation,s.relationSchema),
		isView:            s => s.relation !== false && s.relation.view !== undefined && s.relation.view !== null,
		isViewQuery:       s => s.isView && s.relation.view.definition !== undefined && s.relation.view.definition !== null,
		isViewUnmanaged:   s => s.isView && !s.relation.view.managed,
		relationReadonly:  s => s.readonly || s.isView,
		relationSchema:    s => s.relationIdMap[s.id] === undefined ? false : s.relationIdMap[s.id],
		viewSql:{
			get() {
				if(!this.isView) return '';
				if(this.relation.view.sqlTemplate !== undefined && this.relation.view.sqlTemplate !== null)
					return this.relation.view.sqlTemplate;
				return this.relation.view.sql === null ? '' : this.relation.view.sql;
			},
			set(v) {
				this.relation.view.sqlTemplate = v !== '' ? v : null;
				this.relation.view.sql         = v !== '' ? v : null;
			}
		},
		viewSqlResolved:s => {
			if(!s.isView || s.relation.view.sql === null)
				return '';
			return s.relation.view.sql;
		},
		viewTokenAttributes:s => {
			if(s.viewTokenRelationId === '' || s.relationIdMap[s.viewTokenRelationId] === undefined)
				return [];
			return s.relationIdMap[s.viewTokenRelationId].attributes;
		},
		viewTokenCanInsert:s => {
			if(s.viewTokenKind === 'REL')
				return s.viewTokenRelationId !== '';
			if(s.viewTokenKind === 'ATR')
				return s.viewTokenAttributeId !== '';
			if(s.viewTokenKind === 'PGF')
				return s.viewTokenPgFunctionId !== '';
			return false;
		},
		viewTokenModule:s => s.viewTokenModuleId === '' || s.moduleIdMap[s.viewTokenModuleId] === undefined
			? false : s.moduleIdMap[s.viewTokenModuleId],
		viewTokenPgFunctions:s => s.viewTokenModule === false ? [] : s.viewTokenModule.pgFunctions,
		viewTokenPreview:s => {
			if(!s.viewTokenCanInsert)
				return '';
			return s.getPickedViewSqlToken();
		},
		viewTokenRelations:s => s.viewTokenModule === false ? [] : s.viewTokenModule.relations,
		viewDefinitionBaseRelation:s => !s.isViewQuery || s.relationIdMap[s.relation.view.definition.baseRelationId] === undefined
			? false : s.relationIdMap[s.relation.view.definition.baseRelationId],
		viewDefinitionBaseRelations:s => s.modules.flatMap(m => m.relations),
		viewDefinitionCanAddColumn:s => s.isViewQuery && s.viewDefinitionColumnRelations.length !== 0,
		viewDefinitionCanAddFilter:s => s.isViewQuery && s.viewDefinitionColumnRelations.length !== 0,
		viewDefinitionCanAddHaving:s => s.isViewQuery && s.viewDefinitionOutputColumns.length !== 0,
		viewDefinitionCanAddJoin:s => s.isViewQuery && s.viewDefinitionJoinRelations(s.relation.view.definition.joins.length).length !== 0,
		viewDefinitionCanAddOrder:s => s.isViewQuery && s.viewDefinitionOutputColumns.length !== 0,
		viewDefinitionColumnRelations:s => {
			if(!s.isViewQuery)
				return [];
			const out = [];
			const base = s.viewDefinitionBaseRelation;
			if(base !== false)
				out.push(base);
			for(const join of s.relation.view.definition.joins) {
				const rel = s.relationIdMap[join.relationId];
				if(rel !== undefined && !out.some(r => r.id === rel.id))
					out.push(rel);
			}
			return out;
		},
		viewDefinitionConditionOperators:() => [
			{ value:'=', label:'=' },
			{ value:'<>', label:'!=' },
			{ value:'>', label:'>' },
			{ value:'<', label:'<' },
			{ value:'>=', label:'>=' },
			{ value:'<=', label:'<=' },
			{ value:'LIKE', label:'LIKE' },
			{ value:'ILIKE', label:'ILIKE' },
			{ value:'IN', label:'IN' },
			{ value:'IS NULL', label:'IS NULL' },
			{ value:'IS NOT NULL', label:'IS NOT NULL' }
		],
		viewDefinitionOutputColumns:s => s.isViewQuery ? s.relation.view.definition.columns.filter(c => c.alias !== '').map(c => ({ alias:c.alias })) : [],
		viewDefinitionValid:s => s.isViewQuery
			&& s.relation.view.definition.baseRelationId !== ''
			&& s.relation.view.definition.columns.length !== 0
			&& s.relation.view.definition.joins.every(j => j.relationId !== '' && j.attributeId !== '')
			&& s.relation.view.definition.columns.every(c => c.relationId !== '' && c.attributeId !== '' && c.alias !== '' && (c.function !== 'coalesce' || c.fallback !== ''))
			&& (s.relation.view.definition.filters === undefined || s.relation.view.definition.filters.every(f => f.relationId !== '' && f.attributeId !== '' && f.operator !== '' && (s.viewDefinitionOperatorNeedsNoValue(f.operator) || f.value !== '') && (f.function !== 'coalesce' || f.fallback !== '')))
			&& (s.relation.view.definition.havings === undefined || s.relation.view.definition.havings.every(h => h.columnAlias !== '' && h.operator !== '' && (s.viewDefinitionOperatorNeedsNoValue(h.operator) || h.value !== '')))
			&& (s.relation.view.definition.orders === undefined || s.relation.view.definition.orders.every(o => o.columnAlias !== '' && ['ASC','DESC'].includes(o.direction))),
		
		// stores
		attributeIdMap:s => s.$store.getters['schema/attributeIdMap'],
		modules:       s => s.$store.getters['schema/modules'],
		moduleIdMap:   s => s.$store.getters['schema/moduleIdMap'],
		relationIdMap: s => s.$store.getters['schema/relationIdMap'],
		iconIdMap:     s => s.$store.getters['schema/iconIdMap'],
		capApp:        s => s.$store.getters.captions.builder.relation,
		capGen:        s => s.$store.getters.captions.generic,
		settings:      s => s.$store.getters.settings
	},
	methods:{
		// externals
		copyValueDialog,
		deepIsEqual,
		dialogDeleteAsk,
		getAttributeIcon,
		getDependentAttributes,
		getTemplateRelationPolicy,
		isAttributeDecimal,
		isAttributeFiles,
		isAttributeInteger,
		isAttributeRelationship,
		isAttributeRelationship11,
		isAttributeString,
		isAttributeUuid,
		isAttributeWithLength,
		srcBase64,
		
		// presentation
		displayDataValue(v) {
			return typeof v !== 'string' || v.length < this.previewValueLength
				? v : v.substring(0, this.previewValueLength-3) + '...';
		},
		displayIndexName(ind) {
			if(ind.method === 'GIN')
				return `${this.attributeIdMap[ind.attributes[0].attributeId].name}`;
			
			let atrs = [];
			for(let indAtr of ind.attributes) {
				atrs.push(`${this.attributeIdMap[indAtr.attributeId].name} (${indAtr.orderAsc ? 'ASC' : 'DESC'})`);
			}
			return atrs.join(', ');
		},
		
		// actions
		addPolicy() {
			this.relation.policies.push(this.getTemplateRelationPolicy());
		},
		handleHotkeys(e) {
			if(e.ctrlKey && e.key === 's') {
				if(this.tabTarget === 'properties' && this.canSave)
					this.set();

				e.preventDefault();
			}
		},
		graphClicked(ev) {
			if(typeof ev.data.r3.relationId !== 'undefined' && ev.data.r3.relationId !== null)
				this.$router.push('/builder/relation/'+ev.data.r3.relationId);
		},
		previewReload() {
			this.previewOffset = 0;
			this.getPreview();
		},
		addViewDefinitionColumn() {
			if(!this.viewDefinitionCanAddColumn)
				return;
			const rel = this.viewDefinitionColumnRelations[0];
			const atr = rel.attributes.find(a => a.name === 'id') || rel.attributes[0];
			this.relation.view.definition.columns.push({
				relationId:rel.id,
				attributeId:atr.id,
				alias:this.getViewDefinitionColumnAlias(atr,'',''),
				aggregate:'',
				function:'',
				fallback:''
			});
		},
		addViewDefinitionJoin() {
			const rels = this.viewDefinitionJoinRelations(this.relation.view.definition.joins.length);
			if(rels.length === 0)
				return;
			const attrs = this.viewDefinitionJoinAttributes({relationId:rels[0].id},this.relation.view.definition.joins.length);
			this.relation.view.definition.joins.push({
				relationId:rels[0].id,
				attributeId:attrs.length === 0 ? '' : attrs[0].id,
				required:false
			});
		},
		addViewDefinitionFilter() {
			if(!this.viewDefinitionCanAddFilter)
				return;
			const rel = this.viewDefinitionColumnRelations[0];
			const atr = rel.attributes.find(a => a.name !== 'id') || rel.attributes[0];
			this.relation.view.definition.filters.push({
				connector:'AND',
				relationId:rel.id,
				attributeId:atr.id,
				function:'',
				fallback:'',
				operator:'=',
				value:''
			});
		},
		addViewDefinitionHaving() {
			if(!this.viewDefinitionCanAddHaving)
				return;
			this.relation.view.definition.havings.push({
				connector:'AND',
				columnAlias:this.viewDefinitionOutputColumns[0].alias,
				operator:'=',
				value:''
			});
		},
		addViewDefinitionOrder() {
			if(!this.viewDefinitionCanAddOrder)
				return;
			this.relation.view.definition.orders.push({
				columnAlias:this.viewDefinitionOutputColumns[0].alias,
				direction:'ASC'
			});
		},
		appendPickedViewSqlToken() {
			const token = this.getPickedViewSqlToken();
			if(token !== '')
				this.appendViewSqlToken(token);
		},
		appendViewSqlToken(token) {
			if(this.readonly || !this.isView || !this.relation.view.managed)
				return;

			const prefix = this.viewSql === '' || this.viewSql.endsWith('\n') ? '' : ' ';
			this.viewSql = `${this.viewSql}${prefix}${token}`;
		},
		getPickedViewSqlToken() {
			if(this.viewTokenKind === 'REL') {
				const mod = this.viewTokenModule;
				const rel = this.relationIdMap[this.viewTokenRelationId];
				return mod === false || rel === undefined ? '' : `{REL:${mod.name}.${rel.name}}`;
			}
			if(this.viewTokenKind === 'ATR') {
				const mod = this.viewTokenModule;
				const rel = this.relationIdMap[this.viewTokenRelationId];
				const atr = this.attributeIdMap[this.viewTokenAttributeId];
				return mod === false || rel === undefined || atr === undefined
					? '' : `{ATR:${mod.name}.${rel.name}.${atr.name}}`;
			}
			if(this.viewTokenKind === 'PGF') {
				const mod = this.viewTokenModule;
				const fnc = this.viewTokenPgFunctions.find(v => v.id === this.viewTokenPgFunctionId);
				return mod === false || fnc === undefined ? '' : `{PGF:${mod.name}.${fnc.name}}`;
			}
			return '';
		},
		fillViewDefinitionColumnAlias(column) {
			const atr = this.viewDefinitionColumnAttributes(column).find(a => a.id === column.attributeId);
			if(atr !== undefined && column.alias === '')
				column.alias = this.getViewDefinitionColumnAlias(atr,column.aggregate,column.function);
		},
		getViewDefinitionColumnAlias(attribute,aggregate,fnc) {
			let parts = [];
			if(aggregate !== '')
				parts.push(aggregate);
			if(fnc !== '')
				parts.push(fnc);
			parts.push(attribute.name);
			return parts.join('_');
		},
		recordTitleAttributeAdd(id) {
			this.relation.attributeIdsTitle.push(id);
			this.recordTitleAttributeId = '';
		},
		recordTitleAttributeRemove(id) {
			const pos = this.relation.attributeIdsTitle.indexOf(id);
			if(pos !== -1)
				this.relation.attributeIdsTitle.splice(pos,1);
		},
		reset(manuelReset) {
			if(this.relationSchema !== false && (manuelReset || !this.deepIsEqual(this.relationCopy,this.relationSchema))) {
				this.relation     = JSON.parse(JSON.stringify(this.relationSchema));
				this.relationCopy = JSON.parse(JSON.stringify(this.relationSchema));
				if(!this.relationTabs.includes(this.tabTarget))
					this.tabTarget = this.relationTabs[0];

				if(this.tabTarget === 'data')
					this.previewReload();
				this.resetViewTokenPicker();
				this.resetViewDefinition();
			}
		},
		removeViewDefinitionColumn(pos) {
			const alias = this.relation.view.definition.columns[pos].alias;
			this.relation.view.definition.columns.splice(pos,1);
			this.relation.view.definition.havings = this.relation.view.definition.havings.filter(h => h.columnAlias !== alias);
			this.relation.view.definition.orders = this.relation.view.definition.orders.filter(o => o.columnAlias !== alias);
		},
		removeViewDefinitionFilter(pos) {
			this.relation.view.definition.filters.splice(pos,1);
		},
		removeViewDefinitionHaving(pos) {
			this.relation.view.definition.havings.splice(pos,1);
		},
		removeViewDefinitionJoin(pos) {
			const relId = this.relation.view.definition.joins[pos].relationId;
			this.relation.view.definition.joins.splice(pos,1);
			this.relation.view.definition.columns = this.relation.view.definition.columns.filter(c => c.relationId !== relId);
			this.relation.view.definition.filters = this.relation.view.definition.filters.filter(f => f.relationId !== relId);
		},
		removeViewDefinitionOrder(pos) {
			this.relation.view.definition.orders.splice(pos,1);
		},
		resetViewDefinition() {
			if(!this.isViewQuery)
				return;
			if(this.relation.view.definition.joins === undefined || this.relation.view.definition.joins === null)
				this.relation.view.definition.joins = [];
			if(this.relation.view.definition.columns === undefined || this.relation.view.definition.columns === null)
				this.relation.view.definition.columns = [];
			if(this.relation.view.definition.filters === undefined || this.relation.view.definition.filters === null)
				this.relation.view.definition.filters = [];
			if(this.relation.view.definition.havings === undefined || this.relation.view.definition.havings === null)
				this.relation.view.definition.havings = [];
			if(this.relation.view.definition.orders === undefined || this.relation.view.definition.orders === null)
				this.relation.view.definition.orders = [];
			for(let i = 0; i < this.relation.view.definition.joins.length; i++)
				this.resetViewDefinitionJoin(i);
			for(let i = 0; i < this.relation.view.definition.columns.length; i++) {
				const column = this.relation.view.definition.columns[i];
				if(!this.viewDefinitionColumnRelations.some(r => r.id === column.relationId))
					column.relationId = this.relation.view.definition.baseRelationId;
				if(!this.viewDefinitionColumnAttributes(column).some(a => a.id === column.attributeId))
					this.resetViewDefinitionColumn(i);
				if(column.function === undefined)
					column.function = '';
				if(column.fallback === undefined)
					column.fallback = '';
				this.viewDefinitionColumnFunctionChanged(column);
			}
			for(let i = 0; i < this.relation.view.definition.filters.length; i++) {
				const filter = this.relation.view.definition.filters[i];
				if(!this.viewDefinitionColumnRelations.some(r => r.id === filter.relationId))
					filter.relationId = this.relation.view.definition.baseRelationId;
				if(!this.viewDefinitionColumnAttributes(filter).some(a => a.id === filter.attributeId))
					this.resetViewDefinitionFilter(i);
				if(filter.function === undefined)
					filter.function = '';
				if(filter.fallback === undefined)
					filter.fallback = '';
				if(filter.operator === undefined || filter.operator === '')
					filter.operator = '=';
				this.viewDefinitionColumnFunctionChanged(filter);
			}
			this.relation.view.definition.havings = this.relation.view.definition.havings.filter(h => this.viewDefinitionOutputColumns.some(c => c.alias === h.columnAlias));
			this.relation.view.definition.orders = this.relation.view.definition.orders.filter(o => this.viewDefinitionOutputColumns.some(c => c.alias === o.columnAlias));
		},
		resetViewDefinitionColumn(pos) {
			const column = this.relation.view.definition.columns[pos];
			const attrs = this.viewDefinitionColumnAttributes(column);
			column.attributeId = attrs.length === 0 ? '' : attrs[0].id;
			column.function = '';
			column.fallback = '';
			column.alias = attrs.length === 0 ? '' : this.getViewDefinitionColumnAlias(attrs[0],column.aggregate,column.function);
		},
		resetViewDefinitionJoin(pos) {
			const join = this.relation.view.definition.joins[pos];
			const attrs = this.viewDefinitionJoinAttributes(join,pos);
			join.attributeId = attrs.length === 0 ? '' : attrs[0].id;
		},
		resetViewDefinitionFilter(pos) {
			const filter = this.relation.view.definition.filters[pos];
			const attrs = this.viewDefinitionColumnAttributes(filter);
			filter.attributeId = attrs.length === 0 ? '' : attrs[0].id;
			filter.function = '';
			filter.fallback = '';
		},
		resetViewTokenPicker() {
			if(this.modules.length === 0)
				return;
			if(this.viewTokenModuleId === '' || this.moduleIdMap[this.viewTokenModuleId] === undefined)
				this.viewTokenModuleId = this.relation.moduleId;

			if(this.viewTokenRelations.length !== 0 &&
				(this.viewTokenRelationId === '' || this.relationIdMap[this.viewTokenRelationId] === undefined)) {

				this.viewTokenRelationId = this.viewTokenRelations[0].id;
			}
			if(this.viewTokenAttributes.length !== 0 &&
				(this.viewTokenAttributeId === '' || this.attributeIdMap[this.viewTokenAttributeId] === undefined)) {

				this.viewTokenAttributeId = this.viewTokenAttributes[0].id;
			}
			if(this.viewTokenPgFunctions.length !== 0 &&
				(this.viewTokenPgFunctionId === '' || !this.viewTokenPgFunctions.some(v => v.id === this.viewTokenPgFunctionId))) {

				this.viewTokenPgFunctionId = this.viewTokenPgFunctions[0].id;
			}
		},
		viewDefinitionAvailableTargetRelationIds(pos) {
			const out = [this.relation.view.definition.baseRelationId];
			for(let i = 0; i < pos; i++) {
				const relId = this.relation.view.definition.joins[i].relationId;
				if(relId !== '' && !out.includes(relId))
					out.push(relId);
			}
			return out;
		},
		viewDefinitionColumnAttributes(column) {
			const rel = this.relationIdMap[column.relationId];
			return rel === undefined ? [] : rel.attributes;
		},
		viewDefinitionColumnFunctions(column) {
			const atr = this.viewDefinitionColumnAttributes(column).find(a => a.id === column.attributeId);
			const out = [
				{ value:'', label:'Value' },
				{ value:'coalesce', label:'COALESCE' }
			];
			if(atr === undefined)
				return out;

			if(['date','datetime'].includes(atr.contentUse))
				out.push(
					{ value:'year', label:'Year' },
					{ value:'quarter', label:'Quarter' },
					{ value:'month', label:'Month' },
					{ value:'week', label:'Week' },
					{ value:'day', label:'Day' },
					{ value:'dow', label:'Day of week' }
				);
			if(atr.contentUse === 'datetime')
				out.push(
					{ value:'hour', label:'Hour' },
					{ value:'minute', label:'Minute' }
				);
			else if(atr.contentUse === 'time')
				out.push(
					{ value:'hour', label:'Hour' },
					{ value:'minute', label:'Minute' }
				);

			if(['varchar','text'].includes(atr.content))
				out.push(
					{ value:'lower', label:'Lower' },
					{ value:'upper', label:'Upper' },
					{ value:'trim', label:'Trim' },
					{ value:'length', label:'Length' }
				);

			if(atr.contentUse === 'default' && ['integer','bigint','numeric','real','double precision'].includes(atr.content))
				out.push(
					{ value:'round', label:'Round' },
					{ value:'abs', label:'Absolute' }
				);

			return out;
		},
		viewDefinitionColumnFunctionChanged(column) {
			if(!this.viewDefinitionColumnFunctions(column).some(f => f.value === column.function))
				column.function = '';
			if(column.function !== 'coalesce')
				column.fallback = '';
			this.fillViewDefinitionColumnAlias(column);
		},
		viewDefinitionOperatorNeedsNoValue(operator) {
			return ['IS NULL','IS NOT NULL'].includes(operator);
		},
		viewDefinitionJoinAttributes(join,pos) {
			const rel = this.relationIdMap[join.relationId];
			if(rel === undefined)
				return [];
			const targetIds = this.viewDefinitionAvailableTargetRelationIds(pos);
			const out = rel.attributes.filter(a => ['1:1','n:1'].includes(a.content) && targetIds.includes(a.relationshipId));
			for(const targetId of targetIds) {
				const targetRel = this.relationIdMap[targetId];
				if(targetRel === undefined)
					continue;
				for(const atr of targetRel.attributes) {
					if(['1:1','n:1'].includes(atr.content) && atr.relationshipId === rel.id && !out.some(a => a.id === atr.id))
						out.push(atr);
				}
			}
			return out;
		},
		viewDefinitionJoinAttributeLabel(attribute) {
			const rel = this.relationIdMap[attribute.relationId];
			return rel === undefined ? attribute.name : `${rel.name}.${attribute.name}`;
		},
		viewDefinitionJoinRelations(pos) {
			if(!this.isViewQuery)
				return [];
			const targetIds = this.viewDefinitionAvailableTargetRelationIds(pos);
			const joinedIds = this.relation.view.definition.joins.slice(0,pos).map(j => j.relationId);
			return this.viewDefinitionBaseRelations.filter(r =>
				!targetIds.includes(r.id) &&
				!joinedIds.includes(r.id) &&
				(
					r.attributes.some(a => ['1:1','n:1'].includes(a.content) && targetIds.includes(a.relationshipId)) ||
					targetIds.some(targetId => {
						const targetRel = this.relationIdMap[targetId];
						return targetRel !== undefined && targetRel.attributes.some(a => ['1:1','n:1'].includes(a.content) && a.relationshipId === r.id);
					})
				)
			);
		},
		
		// backend calls
		del() {
			ws.send('relation','del',this.relation.id,true).then(
				() => {
					this.$root.schemaReload(this.relation.moduleId);
					this.$router.push('/builder/relations/'+this.relation.moduleId);
				},
				this.$root.genericError
			);
		},
		getPreview() {
			ws.send('relation','preview',{
				id:this.id,
				limit:this.previewLimit,
				offset:this.previewOffset
			},true).then(
				res => {
					this.previewRows     = res.payload.rows;
					this.previewRowCount = res.payload.rowCount;
				},
				this.$root.genericError
			);
		},
		set() {
			ws.send('relation','set',this.relation,true).then(
				() => { this.$root.schemaReload(this.relation.moduleId); },
				this.$root.genericError
			);
		}
	}
};
