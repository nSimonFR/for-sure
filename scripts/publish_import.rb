# Args: import_id
imp = Import.find(ARGV[0])
account = imp.account
Import::AccountMapping.find_or_create_by!(import: imp, key: "") { |m| m.mappable = account }
imp.import!
imp.update!(status: :complete)
imp.family.sync_later
puts "STATUS=#{imp.reload.status}"
